import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

function qdrantUrls(): {
  rest: string;
  dashboard: string;
  grpc: string;
} {
  const host = process.env.QDRANT_HOST ?? 'localhost';
  const restPort = process.env.QDRANT_PORT ?? '6333';
  const grpcPort = process.env.QDRANT_GRPC_PORT ?? '6334';
  const useTls = process.env.QDRANT_USE_TLS === 'true';
  const scheme = useTls ? 'https' : 'http';
  const restBase = `${scheme}://${host}:${restPort}`;
  return {
    rest: restBase,
    dashboard: `${restBase}/dashboard`,
    grpc: `http://${host}:${grpcPort}`,
  };
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // CORS: allow frontend origins (dev + production)
  const allowedOrigins = [
    'http://localhost:3007',
    'https://coaching.dividendenquelle.de',
  ];
  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Serve uploaded knowledge-base files at /storage/...
  app.useStaticAssets(join(process.cwd(), 'storage'), {
    prefix: '/storage/',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Coaching Bot Pilot')
    .setDescription(
      'Pilot API: knowledge base CRUD; chat ask (RAG + OpenAI) and paginated chat history. To replace KB content, delete then upload.\n\n' +
      '**Auth:** Login at POST /auth/login to receive a Bearer token. Click "Authorize" and paste it.',
    )
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  const appHost = 'localhost';
  const swaggerUrl = `http://${appHost}:${port}/api`;
  const q = qdrantUrls();

  logger.log(`Swagger UI: ${swaggerUrl}`);
  logger.log(
    `Knowledge base files (static): http://${appHost}:${port}/storage/`,
  );
  logger.log(`Qdrant REST API: ${q.rest}`);
  logger.log(`Qdrant Web UI: ${q.dashboard}`);
  logger.log(`Qdrant GRPC: ${q.grpc}`);
  logger.warn(
    '\u26A0\uFE0F  Embeddings changed to OpenAI. Re-upload all documents.',
  );
}
void bootstrap();
