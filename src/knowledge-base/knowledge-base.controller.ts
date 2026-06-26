import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseResponseDto } from './dto/knowledge-base-response.dto';
import { BatchUploadResponseDto } from './dto/batch-upload-response.dto';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_BATCH_FILES = 20;

@ApiTags('knowledge-base')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBase: KnowledgeBaseService) {}

  @Post()
  @Roles('tenant_admin', 'superadmin')
  @ResponseMessage('Knowledge base document uploaded successfully')
  @ApiOperation({
    summary:
      'Upload a .txt, .json, or .pdf file; chunk, embed, and store in Postgres + Qdrant (tenant_admin or superadmin only)',
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
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title?: string,
  ): Promise<KnowledgeBaseResponseDto> {
    return this.knowledgeBase.createFromUpload(file, user.tenantId, title);
  }

  @Post('batch')
  @Roles('tenant_admin', 'superadmin')
  @ResponseMessage('Batch upload processed')
  @ApiOperation({
    summary:
      'Upload up to 20 files in one request (PDF/TXT/JSON). Files are processed sequentially; failures are reported per file. (tenant_admin or superadmin only)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: `Up to ${MAX_BATCH_FILES} files. Max ${MAX_FILE_BYTES / (1024 * 1024)} MB per file.`,
        },
      },
    },
  })
  @ApiResponse({ status: 201, type: BatchUploadResponseDto })
  @UseInterceptors(
    FilesInterceptor('files', MAX_BATCH_FILES, {
      limits: { fileSize: MAX_FILE_BYTES, files: MAX_BATCH_FILES },
    }),
  )
  async createBatch(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<BatchUploadResponseDto> {
    return this.knowledgeBase.createFromUploadBatch(files, user.tenantId);
  }

  @Get()
  @ResponseMessage('Knowledge base documents fetched successfully')
  @ApiOperation({
    summary: 'List knowledge base documents for the current tenant',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<KnowledgeBaseResponseDto[]> {
    return this.knowledgeBase.findAll(user.tenantId);
  }

  @Get(':id')
  @ResponseMessage('Knowledge base document fetched successfully')
  @ApiOperation({ summary: 'Get one knowledge base document by id (current tenant)' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<KnowledgeBaseResponseDto> {
    return this.knowledgeBase.findOne(id, user.tenantId);
  }

  @Delete(':id')
  @Roles('tenant_admin', 'superadmin')
  @ResponseMessage('Knowledge base document deleted successfully')
  @ApiOperation({
    summary:
      'Delete document, local file, and all Qdrant points for the current tenant (tenant_admin or superadmin only)',
  })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ deletedId: number }> {
    await this.knowledgeBase.remove(id, user.tenantId);
    return { deletedId: id };
  }
}
