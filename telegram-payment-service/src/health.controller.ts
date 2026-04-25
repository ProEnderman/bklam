import { Controller, Get } from '@nestjs/common';

/** Liveness for Java backend actuator / health aggregation. */
@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
