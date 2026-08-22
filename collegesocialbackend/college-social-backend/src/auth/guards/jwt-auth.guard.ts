import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Usage: @UseGuards(JwtAuthGuard) on any controller/route that requires login
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
