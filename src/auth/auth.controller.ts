import {
  Controller,
  Post,
  Body,
  Res,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';

interface AuthRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { access_token } = await this.authService.register(dto);
    this.setTokenCookie(res, access_token);
    return { message: 'Registro exitoso' };
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 intentos por minuto
  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { access_token } = await this.authService.login(dto);
    this.setTokenCookie(res, access_token);
    return { message: 'Login exitoso' };
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('token');
    return { message: 'Logout exitoso' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthRequest) {
    return req.user; // Lo que inyecta el JwtStrategy
  }

  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() dto: { email: string }) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'Instrucciones para restablecer contraseña enviadas' };
  }

  private setTokenCookie(res: Response, token: string) {
    res.cookie('token', token, {
      httpOnly: true, // No accesible desde JS
      secure: process.env.NODE_ENV === 'production', // Solo HTTPS en prod
      sameSite: 'lax', // Protección CSRF básica
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días en ms
    });
  }
}
