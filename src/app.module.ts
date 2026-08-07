import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { BusinessModule } from './business/business.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AuthModule } from './auth/auth.module';
import { ServicesModule } from './services/services.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { SchedulesModule } from './schedules/schedules.module';
import { MailService } from './mail/mail.service';
import { ConfigModule } from '@nestjs/config';
import { MailModule } from './mail/mail.module';
import Joi, * as joi from 'joi';

@Module({
  imports: [
    UsersModule,
    AuthModule,
    PrismaModule,
    BusinessModule,
    ServicesModule,
    SchedulesModule,
    AppointmentsModule,
    MailModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        RESEND_API_KEY: Joi.string().required(),
        MAIL_FROM: Joi.string().required(),
        FRONTEND_URL: Joi.string().uri().required(),
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Guard global
    },
    MailService,
  ],
})
export class AppModule {}
