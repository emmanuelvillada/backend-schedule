import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

export interface GoogleProfile {
  email: string;
  name: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      // Si todavía no configuraste las credenciales, usamos placeholders
      // para que el backend arranque igual; el flujo de /auth/google
      // simplemente fallará hasta que se configuren de verdad.
      clientID: process.env.GOOGLE_CLIENT_ID || 'not-configured',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'not-configured',
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        'http://localhost:3000/api/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('No se pudo obtener el correo de la cuenta de Google'));
      return;
    }

    const user: GoogleProfile = {
      email,
      name: profile.displayName || email,
    };
    done(null, user);
  }
}
