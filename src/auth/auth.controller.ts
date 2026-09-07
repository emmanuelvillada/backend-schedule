import {
  Controller,
  Post,
  Body,
  Res,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { GoogleProfile } from './google.strategy';
import { VerifyEmailDto } from './dto/verify-email.dto';

interface AuthRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

interface GoogleAuthRequest extends Request {
  user: GoogleProfile;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 registros por minuto
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
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // El guard redirige a Google; este cuerpo nunca se ejecuta.
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(
    @Req() req: GoogleAuthRequest,
    @Res() res: Response,
  ) {
    const { access_token } = await this.authService.loginWithGoogle(req.user);
    this.setTokenCookie(res, access_token);

    const frontendUrl =
      process.env.FRONTEND_URL?.split(',')[0]?.trim() ??
      'http://localhost:3001';
    res.redirect(frontendUrl);
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

  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 por minuto: evita spam/enumeración
  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() dto: { email: string }) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'Instrucciones para restablecer contraseña enviadas' };
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // evita fuerza bruta sobre el token
  @Public()
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } }) // evita reenvíos masivos
  @UseGuards(JwtAuthGuard)
  @Post('resend-verification')
  async resendVerification(@Req() req: AuthRequest) {
    return this.authService.resendVerificationEmail(req.user.id);
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
