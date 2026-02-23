import { IsString, IsInt, Min, Max, Matches } from 'class-validator';

export class CreateScheduleDto {
  @IsString()
  businessId: string;

  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number; // 0=Domingo, 6=Sábado

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'openTime must be HH:mm' })
  openTime: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'closeTime must be HH:mm' })
  closeTime: string;
}
