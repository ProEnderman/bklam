import { Controller, Get, Header } from '@nestjs/common';
import { QueueMetricsService } from './queue-metrics.service';

@Controller()
export class QueueMetricsController {
  constructor(private readonly metricsService: QueueMetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}
