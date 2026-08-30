import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { MarketplaceService } from './marketplace.service';
import { CreateListingDto, UpdateListingDto } from './dto/listing.dto';

@UseGuards(JwtAuthGuard)
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  // GET /api/marketplace?category=books&q=calculus&mine=true&page=1
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('mine') mine?: string,
    @Query('includeSold') includeSold?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.marketplace.list(user, {
      category,
      q,
      mine: mine === 'true',
      includeSold: includeSold === 'true',
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
  }

  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateListingDto) {
    return this.marketplace.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateListingDto) {
    return this.marketplace.update(user, id, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.marketplace.remove(user, id);
    return { success: true };
  }
}
