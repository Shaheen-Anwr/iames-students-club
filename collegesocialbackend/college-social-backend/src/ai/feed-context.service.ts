import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Post, PostDocument, PostScope } from '../posts/schemas/post.schema';
import { Comment, CommentDocument } from '../posts/schemas/comment.schema';
import { Department } from '../common/enums/department.enum';

const MAX_MATCHES = 3;

// Feed-side counterpart to LectureSearchService: rather than depending on PostsService (which
// would create a circular AiModule <-> PostsModule dependency, since PostsModule already imports
// AiModule for LectureIndexService), this owns its own direct model access, same pattern as
// LectureSearchService owns LectureChunk.
@Injectable()
export class FeedContextService {
  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
  ) {}

  // Same visibility rule as PostsService.search(): a department-scoped post never surfaces to a
  // viewer outside that department.
  async searchPosts(query: string, viewerDepartment?: Department | null): Promise<PostDocument[]> {
    return this.postModel
      .find({
        $text: { $search: query },
        $or: [{ scope: PostScope.PUBLIC }, { scope: PostScope.DEPARTMENT, department: viewerDepartment ?? null }],
      })
      .limit(MAX_MATCHES)
      .exec();
  }

  // Full-thread read for the AI assistant's read_post_thread tool -- unlike searchComments(),
  // returns every comment on one specific post (not just top keyword-matched snippets across
  // posts). Same public/department visibility rule as searchPosts(). Returns null if the post
  // doesn't exist or isn't visible to this viewer, rather than throwing -- a tool-call error is
  // reported back to the model as data, not a 404.
  async getThread(postId: string, viewerDepartment?: Department | null): Promise<{ post: PostDocument; comments: CommentDocument[] } | null> {
    const post = await this.postModel.findById(postId).exec();
    if (!post) return null;
    const visible = post.scope === PostScope.PUBLIC || (post.scope === PostScope.DEPARTMENT && post.department === (viewerDepartment ?? null));
    if (!visible) return null;

    const comments = await this.commentModel
      .find({ post: post._id })
      .sort({ createdAt: 1 })
      .populate('author', 'name role')
      .exec();
    return { post, comments };
  }

  // Comment has no scope/department of its own -- visibility is inherited from its parent post, so
  // the $text match runs first and the visibility filter is applied in-app against the populated post.
  async searchComments(query: string, viewerDepartment?: Department | null): Promise<CommentDocument[]> {
    const matches = await this.commentModel
      .find({ $text: { $search: query } })
      .limit(MAX_MATCHES * 3)
      .populate('post', 'scope department caption courseCode')
      .exec();

    return matches
      .filter((comment) => {
        const post = comment.post as unknown as Pick<Post, 'scope' | 'department'> | null;
        if (!post) return false;
        if (post.scope === PostScope.PUBLIC) return true;
        return post.scope === PostScope.DEPARTMENT && post.department === (viewerDepartment ?? null);
      })
      .slice(0, MAX_MATCHES);
  }
}
