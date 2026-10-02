import { UploadLinks } from './UploadLinks';
import { ReleaseNotesPanel } from './ReleaseNotesPanel';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Avatar } from '../../types/domain';
import { studio } from '../../services/studio';
import { ErrorNotice } from '../../components/common';
import { UnityPanel } from '../avatars/UnityPanel';
import { ProjectHistory } from './ProjectHistory';
import { SnapshotInspector } from './SnapshotInspector';
import { BugsPanel } from './BugsPanel';
import { WorkPanel } from './WorkPanel';
import { DependenciesPanel } from './DependenciesPanel';
export function StudioPanel({ avatar }: { avatar: Avatar }) {
  const [tab, setTab] = useState('Project');
  const snapshots = useQuery({
    queryKey: ['studio-snapshots', avatar.id],
    queryFn: () => studio.snapshots(avatar.id),
    refetchInterval: 5000,
  });
  return (
    <>
      <div className="tabs">
        {[
          'Project',
          'Changes & snapshots',
          'Inspectors',
          'Bugs',
          'Work & stats',
          'Dependencies',
          'Release notes',
        ].map((t) => (
          <button className={tab === t ? 'active' : ''} key={t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {snapshots.error && <ErrorNotice error={snapshots.error} />}
      {tab === 'Project' && <UnityPanel avatarId={avatar.id} />}{' '}
      {tab === 'Changes & snapshots' && (
        <>
          <ProjectHistory avatarId={avatar.id} snapshots={snapshots.data ?? []} />
          <UploadLinks avatarId={avatar.id} />
        </>
      )}{' '}
      {tab === 'Inspectors' && (
        <SnapshotInspector avatar={avatar} snapshots={snapshots.data ?? []} />
      )}{' '}
      {tab === 'Bugs' && <BugsPanel avatarId={avatar.id} version={avatar.custom_version} />}{' '}
      {tab === 'Work & stats' && <WorkPanel avatarId={avatar.id} />}{' '}
      {tab === 'Dependencies' && <DependenciesPanel avatarId={avatar.id} />}
      {tab === 'Release notes' && <ReleaseNotesPanel avatarId={avatar.id} />}
    </>
  );
}
