import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CoachingItemsService } from './coaching-items.service';
import { CoachingItemResponseDto } from './dto/coaching-item-response.dto';
import { CreateCoachingItemDto } from './dto/create-coaching-item.dto';
import { ListCoachingItemsQueryDto } from './dto/list-coaching-items-query.dto';
import { UpdateCoachingItemDto } from './dto/update-coaching-item.dto';

// All routes are scoped to the authenticated user (id + tenantId from the JWT).
// Any authenticated user manages ONLY their own items — no admin role gate.
@ApiTags('coaching-items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('coaching-items')
export class CoachingItemsController {
  constructor(private readonly coachingItems: CoachingItemsService) {}

  @Post()
  @ResponseMessage('Coaching item created successfully')
  @ApiOperation({ summary: 'Create a coaching item for the current user' })
  @ApiResponse({ status: 201, type: CoachingItemResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCoachingItemDto,
  ): Promise<CoachingItemResponseDto> {
    return this.coachingItems.create(user.id, user.tenantId, dto);
  }

  @Get()
  @ResponseMessage('Coaching items fetched successfully')
  @ApiOperation({
    summary:
      "List the current user's coaching items (filterable by status and type)",
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCoachingItemsQueryDto,
  ): Promise<{ items: CoachingItemResponseDto[]; total: number }> {
    return this.coachingItems.findAll(user.id, user.tenantId, query);
  }

  @Get(':id')
  @ResponseMessage('Coaching item fetched successfully')
  @ApiOperation({ summary: 'Get one of the current user\'s coaching items by id' })
  @ApiResponse({ status: 404, description: 'Not found or owned by another user' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CoachingItemResponseDto> {
    return this.coachingItems.findOne(id, user.id, user.tenantId);
  }

  @Patch(':id')
  @ResponseMessage('Coaching item updated successfully')
  @ApiOperation({ summary: 'Update one of the current user\'s coaching items' })
  @ApiResponse({ status: 404, description: 'Not found or owned by another user' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCoachingItemDto,
  ): Promise<CoachingItemResponseDto> {
    return this.coachingItems.update(id, user.id, user.tenantId, dto);
  }

  @Delete(':id')
  @ResponseMessage('Coaching item deleted successfully')
  @ApiOperation({ summary: 'Delete one of the current user\'s coaching items' })
  @ApiResponse({ status: 404, description: 'Not found or owned by another user' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ deletedId: number }> {
    await this.coachingItems.remove(id, user.id, user.tenantId);
    return { deletedId: id };
  }
}
