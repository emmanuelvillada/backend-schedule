import { PartialType, OmitType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateServiceDto } from './create-service.dto';

// businessId no se puede reasignar vía update: evita "mover" un servicio
// a un negocio que el owner no controla.
export class UpdateServiceDto extends PartialType(
  OmitType(CreateServiceDto, ['businessId'] as const),
) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
