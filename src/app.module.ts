import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { BusinessModule } from './business/business.module';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AuthModule } from './auth/auth.module';
import { ServicesModule } from './services/services.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { SchedulesModule } from './schedules/schedules.module';
import { ReviewsModule } from './reviews/reviews.module';
import { EmployeesModule } from './employees/employees.module';
import { MailService } from './mail/mail.service';
import { ConfigModule } from '@nestjs/config';
import { MailModule } from './mail/mail.module';
import Joi from 'joi';
import { ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    UsersModule,
    AuthModule,
    PrismaModule,
    BusinessModule,
    ServicesModule,
    SchedulesModule,
    AppointmentsModule,
    ReviewsModule,
    EmployeesModule,
    MailModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        RESEND_API_KEY: Joi.string().required(),
        MAIL_FROM: Joi.string().required(),
        FRONTEND_URL: Joi.string().uri().required(),
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Guard global
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter, // Filtro global de excepciones
    },
    MailService,
  ],
})
export class AppModule {}
