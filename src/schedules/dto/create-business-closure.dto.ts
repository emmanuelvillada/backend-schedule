import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateBusinessClosureDto {
  @IsDateString(
    { strict: true },
    { message: 'date debe tener formato YYYY-MM-DD' },
  )
  date: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
