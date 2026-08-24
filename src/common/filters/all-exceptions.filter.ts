import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

interface ErrorResponseBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
}

@Catch() // sin argumentos = captura TODAS las excepciones, no solo HttpException
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, message, error } = this.resolveException(exception);

    const body: ErrorResponseBody = {
      statusCode,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    // Log con nivel según severidad: 5xx es error real, 4xx es advertencia
    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${request.method} ${request.url} - ${statusCode} - ${message}`,
      );
    }

    response.status(statusCode).json(body);
  }

  private resolveException(exception: unknown): {
    statusCode: number;
    message: string | string[];
    error: string;
  } {
    // Caso 1: excepciones nativas de Nest (UnauthorizedException, ConflictException, etc)
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const statusCode = exception.getStatus();

      if (typeof response === 'string') {
        return { statusCode, message: response, error: exception.name };
      }

      const res = response as { message?: string | string[]; error?: string };
      return {
        statusCode,
        message: res.message ?? exception.message,
        error: res.error ?? exception.name,
      };
    }

    // Caso 2: errores conocidos de Prisma (constraint violado, registro no encontrado, etc)
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrismaError(exception);
    }

    // Caso 3: cualquier otra cosa (error inesperado) -> nunca exponer el mensaje real al cliente
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Ocurrió un error interno. Intenta más tarde.',
      error: 'InternalServerError',
    };
  }

  private resolvePrismaError(exception: Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002': // unique constraint
        return {
          statusCode: HttpStatus.CONFLICT,
          message: `El valor de '${(exception.meta?.target as string[])?.join(', ')}' ya existe.`,
          error: 'ConflictException',
        };
      case 'P2025': // registro no encontrado
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'El recurso solicitado no existe.',
          error: 'NotFoundException',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Error al procesar la solicitud en la base de datos.',
          error: 'DatabaseError',
        };
    }
  }
}
