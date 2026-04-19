import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Login successful')
  @ApiOperation({ summary: 'Authenticate with username + password, receive JWT token' })
  @ApiResponse({ status: 200, description: 'Returns accessToken and user info' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage('Current user fetched successfully')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the current authenticated user from JWT' })
  @ApiResponse({ status: 200, description: 'Returns current user (id, username, role)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.getMe(user.id);
  }

  // ─── Profile ─────────────────────────────────────────────────────────────

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage('Profile fetched successfully')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Return the current user with profile fields (avatar, logo, defaults)',
  })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  getProfile(@CurrentUser() user: AuthenticatedUser): Promise<ProfileResponseDto> {
    return this.auth.getProfile(user.id);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage('Profile updated successfully')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update defaultLanguage and/or soundEnabled' })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.auth.updateProfile(user.id, dto);
  }

  @Post('profile/avatar')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage('Avatar uploaded successfully')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upload avatar image (jpeg, png, webp; max 5 MB)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['avatar'],
      properties: {
        avatar: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, type: ProfileResponseDto })
  @ApiResponse({ status: 400, description: 'Missing or unsupported file' })
  @UseInterceptors(
    FileInterceptor('avatar', { limits: { fileSize: MAX_IMAGE_BYTES } }),
  )
  uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ProfileResponseDto> {
    return this.auth.uploadAvatar(user.id, file);
  }

  @Post('profile/logo')
  @UseGuards(JwtAuthGuard)
  @ResponseMessage('Logo uploaded successfully')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upload logo image (jpeg, png, webp, svg; max 5 MB)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['logo'],
      properties: {
        logo: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, type: ProfileResponseDto })
  @ApiResponse({ status: 400, description: 'Missing or unsupported file' })
  @UseInterceptors(
    FileInterceptor('logo', { limits: { fileSize: MAX_IMAGE_BYTES } }),
  )
  uploadLogo(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ProfileResponseDto> {
    return this.auth.uploadLogo(user.id, file);
  }
}
