import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ChatService } from './chat.service';
import { AskChatDto } from './dto/ask-chat.dto';
import { ChatHistoryQueryDto } from './dto/chat-history-query.dto';

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post('ask')
  @ResponseMessage('Reply generated successfully')
  @ApiOperation({
    summary:
      'Ask the coach: retrieve knowledge from Qdrant (RAG) and generate a Gemini reply; stores user + assistant messages',
  })
  ask(@Body() dto: AskChatDto) {
    return this.chat.ask(dto);
  }

  @Get('history')
  @ResponseMessage('Chat history fetched successfully')
  @ApiOperation({
    summary: 'Paginated chat history (newest first)',
  })
  history(@Query() query: ChatHistoryQueryDto) {
    return this.chat.getHistory(query.page, query.limit);
  }
}
