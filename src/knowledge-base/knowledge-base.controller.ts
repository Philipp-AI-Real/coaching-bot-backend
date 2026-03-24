import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseResponseDto } from './dto/knowledge-base-response.dto';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

@ApiTags('knowledge-base')
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBase: KnowledgeBaseService) {}

  @Post()
  @ResponseMessage('Knowledge base document uploaded successfully')
  @ApiOperation({
    summary:
      'Upload a .txt, .json, or .pdf file; chunk, embed, and store in Postgres + Qdrant',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        title: {
          type: 'string',
          description: 'Optional display title',
          example: '',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_BYTES },
    }),
  )
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title?: string,
  ): Promise<KnowledgeBaseResponseDto> {
    return this.knowledgeBase.createFromUpload(file, title);
  }

  @Get()
  @ResponseMessage('Knowledge base documents fetched successfully')
  @ApiOperation({
    summary: 'List knowledge base documents (Postgres metadata)',
  })
  findAll(): Promise<KnowledgeBaseResponseDto[]> {
    return this.knowledgeBase.findAll();
  }

  @Get(':id')
  @ResponseMessage('Knowledge base document fetched successfully')
  @ApiOperation({ summary: 'Get one knowledge base document by id' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<KnowledgeBaseResponseDto> {
    return this.knowledgeBase.findOne(id);
  }

  @Delete(':id')
  @ResponseMessage('Knowledge base document deleted successfully')
  @ApiOperation({
    summary:
      'Delete document, local file, and all Qdrant points with metadata knowledgeBaseId = id',
  })
  async remove(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ deletedId: number }> {
    await this.knowledgeBase.remove(id);
    return { deletedId: id };
  }
}
