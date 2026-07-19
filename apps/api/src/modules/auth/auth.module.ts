import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './guards/auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    SupabaseService,
    AuthService,
    AuthGuard,
    OptionalAuthGuard,
  ],
  controllers: [AuthController],
  exports: [SupabaseService, AuthService, AuthGuard, OptionalAuthGuard],
})
export class AuthModule {}
