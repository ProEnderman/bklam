import { Injectable, ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    
    this.logger.debug(`🔒 JWT Guard - Path: ${request.path}`);
    this.logger.debug(`🔒 JWT Guard - Authorization header: ${authHeader ? 'present' : 'missing'}`);
    
    if (!authHeader) {
      this.logger.warn('❌ No Authorization header found');
      throw new UnauthorizedException('No authorization header');
    }

    if (!authHeader.startsWith('Bearer ')) {
      this.logger.warn('❌ Authorization header does not start with Bearer');
      throw new UnauthorizedException('Invalid authorization header format');
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      this.logger.error(`❌ JWT validation failed:`, {
        error: err?.message,
        errorName: err?.name,
        info: info?.message,
        infoName: info?.name,
        stack: err?.stack,
      });
      
      // Дополнительная информация об ошибке
      if (info) {
        this.logger.error(`JWT Info details:`, JSON.stringify(info, null, 2));
      }
      
      throw err || new UnauthorizedException(`JWT validation failed: ${info?.message || 'Unknown error'}`);
    }
    
    this.logger.debug(`✅ JWT validated successfully for user: ${user.email}`);
    return user;
  }
}
