import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Listing, ListingDocument } from './schemas/listing.schema';
import { CreateListingDto, UpdateListingDto } from './dto/listing.dto';
import { Department } from '../common/enums/department.enum';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';

interface SellerRef {
  _id: Types.ObjectId;
  name?: string;
  photoUrl?: string | null;
}

export interface ListingView {
  _id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  status: string;
  department: Department | null;
  images: string[];
  mine: boolean;
  seller: { _id: string; name: string; photoUrl: string | null } | null;
  createdAt: Date;
}

@Injectable()
export class MarketplaceService {
  constructor(@InjectModel(Listing.name) private readonly model: Model<ListingDocument>) {}

  private toView(doc: ListingDocument, viewerId: string): ListingView {
    const s = doc.seller as unknown as SellerRef | null;
    const seller =
      s && s._id ? { _id: s._id.toString(), name: s.name ?? 'مستخدم محذوف', photoUrl: s.photoUrl ?? null } : null;
    return {
      _id: doc._id.toString(),
      title: doc.title,
      description: doc.description,
      price: doc.price,
      category: doc.category,
      status: doc.status,
      department: doc.department,
      images: doc.images ?? [],
      mine: seller?._id === viewerId,
      seller,
      createdAt: (doc as unknown as { createdAt: Date }).createdAt,
    };
  }

  async list(
    user: AuthenticatedUser,
    opts: { category?: string; q?: string; mine?: boolean; includeSold?: boolean; page?: number; limit?: number },
  ): Promise<ListingView[]> {
    const page = opts.page ?? 1;
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);

    const filter: FilterQuery<ListingDocument> = {
      $or: [{ department: null }, { department: user.department ?? null }],
    };
    if (opts.mine) filter.seller = new Types.ObjectId(user.userId);
    if (opts.category) filter.category = opts.category;
    if (!opts.includeSold && !opts.mine) filter.status = { $ne: 'sold' };
    if (opts.q) filter.$text = { $search: opts.q };

    const docs = await this.model
      .find(filter)
      .sort(opts.q ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('seller', 'name photoUrl')
      .exec();
    return docs.map((d) => this.toView(d, user.userId));
  }

  async create(user: AuthenticatedUser, dto: CreateListingDto): Promise<ListingView> {
    const doc = await this.model.create({
      seller: new Types.ObjectId(user.userId),
      title: dto.title,
      description: dto.description ?? '',
      price: dto.price,
      category: dto.category,
      department: user.department ?? null,
      images: dto.images ?? [],
    });
    await doc.populate('seller', 'name photoUrl');
    return this.toView(doc, user.userId);
  }

  private async owned(id: string, user: AuthenticatedUser): Promise<ListingDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('الإعلان غير موجود');
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException('الإعلان غير موجود');
    if (doc.seller.toString() !== user.userId && user.role !== Role.ADMIN) {
      throw new ForbiddenException('لا تملك صلاحية تعديل هذا الإعلان');
    }
    return doc;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateListingDto): Promise<ListingView> {
    const doc = await this.owned(id, user);
    if (dto.title !== undefined) doc.title = dto.title;
    if (dto.description !== undefined) doc.description = dto.description;
    if (dto.price !== undefined) doc.price = dto.price;
    if (dto.category !== undefined) doc.category = dto.category;
    if (dto.status !== undefined) doc.status = dto.status;
    if (dto.images !== undefined) doc.images = dto.images;
    await doc.save();
    await doc.populate('seller', 'name photoUrl');
    return this.toView(doc, user.userId);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const doc = await this.owned(id, user);
    await doc.deleteOne();
  }
}
