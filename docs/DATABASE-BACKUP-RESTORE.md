# Database backup and restore runbook

This runbook is for the production MongoDB Atlas database. It documents operator steps; it does not contain credentials or automatically change Atlas backup configuration.

## Backup policy to configure in Atlas

- Enable automated Cloud Backup for the production cluster. Prefer continuous backup / point-in-time recovery (PITR) if the cluster tier supports it; otherwise use daily snapshots.
- Start with a 30-day retention target, then confirm the selected Atlas tier and storage cost support it. Record the actual retention and recovery-point objective (RPO) in the service operations notes.
- Restrict backup and restore permissions to designated operators; use a separate least-privilege Atlas database user for application traffic.
- Configure Atlas backup-failure notifications and review them at least weekly.
- Keep credentials, exported dumps, and restore-cluster connection strings out of Git and tickets.

Suggested initial recovery objectives (confirm with the service owner): **RPO 24 hours** and **RTO 4 hours**. PITR may improve the RPO; a restore rehearsal is needed to establish the real RTO.

## Restore rehearsal (quarterly and after material database changes)

1. Notify the service owner and choose a recent restore point. Never restore over production during a rehearsal.
2. In Atlas, restore the snapshot / point-in-time backup to a **new isolated cluster** with access restricted to the operators performing the drill. Do not reuse production credentials.
3. Connect with `mongosh` using the isolated cluster URI. Check that the expected database and core collections exist and that representative documents can be read. Verify indexes with `db.users.getIndexes()` and run the application's read-only smoke checks against the isolated environment where practical.
4. Record the selected backup time, restore start/end times, data checks, issues, and measured RPO / RTO. Delete the temporary cluster and credentials when the review is complete.
5. If a real recovery is needed, pause writes/deployments as appropriate, get explicit incident-lead approval for the target and restore point, restore to a clean target, verify it, then update the application's `MONGODB_URI` through the hosting provider's secret manager. Keep the old database intact until the recovered service is verified.

## Optional logical export

Atlas Cloud Backup is the primary recovery mechanism. A logical export can be useful for a controlled copy or an additional archive, but it is not a substitute for managed backups. Run this only from a trusted machine with MongoDB Database Tools installed. Set non-credential cluster URIs and usernames in the operator's protected shell environment; the commands prompt for passwords. Never commit credentials or paste credential-bearing URIs into a terminal transcript. Limit access to the output archive and encrypt it at rest.

```sh
# Export a compressed archive. Keep the archive in an approved encrypted backup location.
mongodump --uri="$BACKUP_CLUSTER_URI" --username="$BACKUP_USERNAME" --password \
  --authenticationDatabase=admin --db=college-social \
  --archive=college-social.archive.gz --gzip

# Restore only into a NEW, isolated test database/cluster. This deliberately avoids --drop.
mongorestore --uri="$RESTORE_CLUSTER_URI" --username="$RESTORE_USERNAME" --password \
  --authenticationDatabase=admin --nsFrom='college-social.*' \
  --nsTo='college-social-restore-drill.*' --archive=college-social.archive.gz --gzip
```

The restore command is intentionally namespaced to a drill database and does not drop existing collections. Confirm the resulting namespace and target before any production recovery operation.

## Media and uploads are separate

MongoDB backups do not back up media bytes. The application stores media in Cloudinary when it is configured and can fall back to the backend's `/var/data/uploads` persistent disk. Confirm each production upload path has its own provider retention/recovery plan, and include a sample image and document URL check in restore drills. Do not assume a Mongo restore alone recovers user uploads.

## Drill record

Record each run in the team's approved operations log:

- Date, operator, and backup/restore point
- Atlas source and isolated restore target (no credentials)
- Restore duration, validation performed, and outcome
- Measured RPO/RTO, follow-up actions, and cleanup confirmation
