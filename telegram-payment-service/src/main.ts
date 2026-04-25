import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { validateSecretsOrThrow } from './security/secret-validation';

async function bootstrap() {
  validateSecretsOrThrow();
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(`🚀 Telegram Payment Service running on port ${port}`);
  console.log(`JWT configuration detected: ${process.env.JWT_SECRET ? 'YES' : 'NO'}`);
}

bootstrap();
