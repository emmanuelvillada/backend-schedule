import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { SchedulesModule } from 'src/schedules/schedules.module';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [SchedulesModule, MailModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
