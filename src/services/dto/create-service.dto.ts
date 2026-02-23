import { IsString, IsOptional, IsInt, IsNumber, Min } from 'class-validator';

export class CreateServiceDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  durationMin: number;

  @IsNumber()
  @Min(0)
  price: number;

  @IsString()
  businessId: string;
}
