import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from './common/decorators/response-message.decorator';

@ApiTags('health')
@Controller('health')
export class AppController {
  @Get()
  @ResponseMessage('Service is healthy')
  @ApiOperation({ summary: 'Liveness check' })
  health(): { ok: boolean } {
    return { ok: true };
  }
}
