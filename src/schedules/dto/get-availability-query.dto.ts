import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GetAvailabilityQueryDto {
  @IsDateString(
    { strict: true },
    { message: 'date debe tener formato YYYY-MM-DD' },
  )
  date: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  // Duración total de los servicios que el cliente ya eligió; determina si
  // el slot realmente tiene hueco libre, no solo si su inicio está libre.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  durationMin?: number = 30;
}
