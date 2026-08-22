import { ChannelWindow } from '@/components/groups/ChannelWindow';

export default function GroupChannelPage({ params }: { params: { groupId: string; channelId: string } }) {
  return <ChannelWindow groupId={params.groupId} channelId={params.channelId} />;
}
