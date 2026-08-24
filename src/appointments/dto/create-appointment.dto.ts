import { IsString, IsOptional, IsDateString, IsArray } from 'class-validator';

export class CreateAppointmentDto {
  @IsDateString()
  startTime: string; // ISO 8601: "2025-03-15T10:00:00.000Z"

  @IsString()
  businessId: string;

  @IsString()
  clientId: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsArray()
  @IsString({ each: true })
  serviceIds: string[]; // Se calculará endTime con la suma de duraciones
}
