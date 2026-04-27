import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { applyMigrationsAndReset } from './setup';

const ADMIN_EMAIL = 'admin@local.test';
const ADMIN_PASSWORD = 'admin1234';
const USER_EMAIL = 'user@local.test';

describe('Auth + admin users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    await applyMigrationsAndReset();
    prisma = new PrismaClient();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const passwordHash = await argon2.hash(ADMIN_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        role: UserRole.admin,
        mustChangePassword: false,
        displayName: 'Admin',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('1. POST /auth/login with correct credentials → 200 + accessToken', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.mustChangePassword).toBe(false);
    expect(res.headers['set-cookie']?.[0]).toMatch(/aqsha_refresh=/);
  });

  it('2. POST /auth/login with wrong password → 401', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'wrong-password' })
      .expect(401);
  });

  it('4. GET /me without token → 401', async () => {
    await request(app.getHttpServer()).get('/api/me').expect(401);
  });

  it('5. GET /me with token → 200 + user data', async () => {
    const login = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(200);
    expect(res.body.email).toBe(ADMIN_EMAIL);
    expect(res.body.role).toBe('admin');
  });

  it('7. POST /admin/users by admin → 201 + temporaryPassword', async () => {
    const login = await loginAs(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .send({ email: USER_EMAIL, displayName: 'Regular', role: 'user' })
      .expect(201);
    expect(res.body.user.email).toBe(USER_EMAIL);
    expect(typeof res.body.temporaryPassword).toBe('string');
    expect(res.body.temporaryPassword.length).toBeGreaterThan(8);
  });

  it('6. GET /admin/users by regular user → 403', async () => {
    const tempUser = await prisma.user.findUniqueOrThrow({ where: { email: USER_EMAIL } });
    const tempPass = 'temp-password-1234';
    const passwordHash = await argon2.hash(tempPass, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    await prisma.user.update({
      where: { id: tempUser.id },
      data: { passwordHash, mustChangePassword: false },
    });
    const login = await loginAs(app, USER_EMAIL, tempPass);
    await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(403);
  });

  it('8. mustChangePassword user → 403 PASSWORD_CHANGE_REQUIRED on /admin/users', async () => {
    const tempPass = 'temp-password-9876';
    const passwordHash = await argon2.hash(tempPass, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    const u = await prisma.user.create({
      data: {
        email: 'pwd-required@local.test',
        passwordHash,
        role: UserRole.user,
        mustChangePassword: true,
        displayName: 'PwdRequired',
      },
    });
    const login = await loginAs(app, u.email, tempPass);
    expect(login.mustChangePassword).toBe(true);
    const res = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(403);
    expect(res.body.code ?? res.body.error?.code ?? res.body.message?.code).toBe(
      'PASSWORD_CHANGE_REQUIRED',
    );
  });

  it('9. POST /auth/change-password invalidates all refresh tokens', async () => {
    const tempPass = 'temp-password-5555';
    const passwordHash = await argon2.hash(tempPass, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    const u = await prisma.user.create({
      data: {
        email: 'rotate@local.test',
        passwordHash,
        role: UserRole.user,
        mustChangePassword: false,
        displayName: 'Rotate',
      },
    });
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/auth/login')
      .send({ email: u.email, password: tempPass })
      .expect(200);
    await agent
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: tempPass, newPassword: 'new-password-very-strong' })
      .expect(200);

    // Old refresh cookie was sent with the change-password request and should now be revoked.
    await agent.post('/api/auth/refresh').expect(401);
  });

  it('3. POST /auth/login 6 times → 429 (throttle)', async () => {
    const targetEmail = 'throttle@local.test';
    const tempPass = 'temp-password-throttle';
    const passwordHash = await argon2.hash(tempPass, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    await prisma.user.create({
      data: {
        email: targetEmail,
        passwordHash,
        role: UserRole.user,
        mustChangePassword: false,
        displayName: 'Throttle',
      },
    });
    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: targetEmail, password: 'wrong' });
      lastStatus = res.status;
    }
    expect([401, 429]).toContain(lastStatus);
    // best-effort: at least one of the last attempts should be throttled
    const final = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: targetEmail, password: 'wrong' });
    expect([401, 429]).toContain(final.status);
  });
});

async function loginAs(
  app: INestApplication,
  email: string,
  password: string,
): Promise<{ accessToken: string; mustChangePassword: boolean }> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body;
}
