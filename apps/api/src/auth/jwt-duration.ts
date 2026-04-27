/**
 * @nestjs/jwt v11 narrows expiresIn to ms's StringValue (a template literal type)
 * or number. We only ever feed durations like "15m" / "30d" / "12h" from env, so
 * a local alias keeps the cast surface minimal without pulling ms types directly.
 */
export type JwtDuration = `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}` | number;
