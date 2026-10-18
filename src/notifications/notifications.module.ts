import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { WhatsappModule } from 'src/whatsapp/whatsapp.module';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [MailModule, WhatsappModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
