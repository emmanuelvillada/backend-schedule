// notifications/notifications.module.ts
import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [MailModule, WhatsappModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
