import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditLogData {
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Log an audit event
   */
  async log(data: AuditLogData) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: data.userId,
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          metadata: data.metadata || undefined,
          ip: data.ip,
          userAgent: data.userAgent,
        },
      });

      this.logger.log(
        `Audit: ${data.action} on ${data.entity}${data.entityId ? `:${data.entityId}` : ''} by user ${data.userId || 'system'}`,
      );
    } catch (error) {
      // Don't fail the main operation if audit logging fails
      this.logger.error('Failed to write audit log', error);
    }
  }

  /**
   * Get audit logs for a user
   */
  async getLogsForUser(
    userId: string,
    options: { limit?: number; offset?: number } = {},
  ) {
    const { limit = 50, offset = 0 } = options;

    return this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get audit logs by entity
   */
  async getLogsForEntity(entity: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
