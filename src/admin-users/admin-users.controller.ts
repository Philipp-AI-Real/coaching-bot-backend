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
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import {
  AdminUsersListData,
  AdminUsersService,
} from './admin-users.service';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// User management for admins. All routes require tenant_admin or superadmin and
// operate strictly within the caller's own tenant (tenantId from the JWT).
@ApiTags('admin-users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tenant_admin', 'superadmin')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Post()
  @ResponseMessage('User created successfully')
  @ApiOperation({ summary: 'Create a user in the current tenant' })
  @ApiResponse({ status: 201, type: AdminUserResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUserDto,
  ): Promise<AdminUserResponseDto> {
    return this.adminUsers.create(user.tenantId, dto);
  }

  @Get()
  @ResponseMessage('Users fetched successfully')
  @ApiOperation({ summary: "List the current tenant's users (search + paginate)" })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListUsersQueryDto,
  ): Promise<AdminUsersListData> {
    return this.adminUsers.findAll(user.tenantId, query);
  }

  @Get(':id')
  @ResponseMessage('User fetched successfully')
  @ApiOperation({ summary: 'Get one user in the current tenant' })
  @ApiResponse({ status: 404, description: 'Not found or in another tenant' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AdminUserResponseDto> {
    return this.adminUsers.findOne(id, user.tenantId);
  }

  @Patch(':id')
  @ResponseMessage('User updated successfully')
  @ApiOperation({ summary: 'Update a user (role / language / sound)' })
  @ApiResponse({ status: 404, description: 'Not found or in another tenant' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<AdminUserResponseDto> {
    return this.adminUsers.update(id, user.tenantId, dto);
  }

  @Patch(':id/password')
  @ResponseMessage('Password reset successfully')
  @ApiOperation({ summary: "Reset a user's password" })
  @ApiResponse({ status: 404, description: 'Not found or in another tenant' })
  resetPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ): Promise<AdminUserResponseDto> {
    return this.adminUsers.resetPassword(id, user.tenantId, dto.password);
  }

  @Delete(':id')
  @ResponseMessage('User deleted successfully')
  @ApiOperation({ summary: 'Delete a user (cascades chat + coaching items)' })
  @ApiResponse({ status: 404, description: 'Not found or in another tenant' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ deletedId: number }> {
    const deletedId = await this.adminUsers.remove(id, user.tenantId, user.id);
    return { deletedId };
  }
}
