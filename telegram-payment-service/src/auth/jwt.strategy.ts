import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string; // username (from Java backend)
  userId?: number; // userId from claims
  username?: string; // username from claims
  role: string;
  restaurantId?: number;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const secret = configService.getOrThrow<string>('JWT_SECRET');
    console.log('🔑 NestJS JWT Strategy initialized');
    
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS512', 'HS256'], // Поддерживаем оба алгоритма (Java использует HS512)
    });
  }

  async validate(payload: any) {
    // Java backend использует:
    // - sub: username
    // - userId: Long (в claims)
    // - username: String (в claims)
    // - role: String
    // - restaurantId: Long (в claims, опционально)
    
    const userId = payload.userId;
    const username = payload.username || payload.sub;
    const role = payload.role;
    const restaurantId = payload.restaurantId;
    
    // ВАЖНО: Пока не требуем наличия пользователя в БД NestJS
    // Просто возвращаем объект из токена
    // Это позволяет работать без синхронизации пользователей между системами
    
    const user = {
      id: String(userId || 'unknown'),
      email: username || 'unknown',
      role: role || 'CASHIER',
      restaurantId: String(restaurantId || 'unknown'),
    };
    
    console.log('✅ User validated from token:', user.email, 'role:', user.role);
    return user;
  }
}
