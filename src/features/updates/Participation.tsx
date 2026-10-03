import { useMutation, useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { desktop, mockMode } from '../../db/bridge';
import { Button } from '../../components/ui/button';
import { ErrorNotice } from '../../components/common';

type ParticipationState = {
  available: boolean;
  endpoint: string | null;
  enabled: boolean;
  pendingDelete: boolean;
  status: string;
};
export function Participation() {
  const native = desktop && !mockMode;
  const state = useQuery({
    queryKey: ['participation'],
    queryFn: () => invoke<ParticipationState>('participation', { enabled: null }),
    enabled: native,
    refetchInterval: 30000,
  });
  const change = useMutation({
    mutationFn: (enabled: boolean) => invoke<ParticipationState>('participation', { enabled }),
    onSuccess: () => state.refetch(),
  });
  const value = state.data;
  return (
    <section className="panel">
      <h2>Confidentialité · Statistiques facultatives</h2>
      <p>
        Aide à améliorer VAV en partageant sa version, les sessions d’utilisation et des compteurs
        de requêtes VRChat : opération, résultat HTTP et temps de réponse. Désactivé par défaut.
      </p>
      <p className="muted">
        Un identifiant aléatoire distingue ton installation. Aucun nom, e-mail, identifiant VRChat,
        avatar, contenu de requête, mot de passe ou journal n’est transmis. Envoi à l’activation
        puis toutes les 15 minutes, conservation de 90 jours. Le propriétaire de VAV consulte les
        totaux dans son panneau privé. Le serveur reçoit techniquement ton adresse IP pour la
        connexion, mais l’application serveur ne la conserve pas dans ses statistiques.
      </p>
      {value?.endpoint?.endsWith('.workers.dev') && (
        <p className="muted">
          Hébergement : Cloudflare Workers et D1. Cloudflare traite les métadonnées de connexion
          nécessaires à son service. Les statistiques supprimées peuvent rester jusqu’à 7 jours dans
          son historique de restauration D1 sur le plan gratuit. Une empreinte du retrait, sans
          compteurs, est conservée 90 jours pour bloquer les anciens envois.
        </p>
      )}
      {!native || (value && !value.available) ? (
        <p>Collecteur non configuré dans cette version : aucune donnée n’est envoyée.</p>
      ) : (
        <>
          {value?.endpoint && <p className="tiny muted">Destinataire : {value.endpoint}</p>}
          <p role="status">
            {value?.enabled ? 'Partage activé' : 'Partage désactivé'} · {value?.status}
          </p>
          <Button
            disabled={!value || change.isPending || (value.pendingDelete && !value.enabled)}
            onClick={() => change.mutate(!value?.enabled)}
          >
            {value?.enabled
              ? 'Arrêter et supprimer mes statistiques'
              : 'J’accepte de partager ces statistiques'}
          </Button>
          {value?.pendingDelete && (
            <Button disabled={change.isPending} onClick={() => change.mutate(false)}>
              Réessayer la suppression distante
            </Button>
          )}
          <p className="tiny muted">
            Le retrait arrête immédiatement les mesures et demande leur suppression. Si le serveur
            est indisponible, la demande sera réessayée lors des prochains envois, y compris après
            redémarrage. La fermeture de VAV suspend ces essais.
          </p>
        </>
      )}
      {(state.error || change.error) && <ErrorNotice error={state.error || change.error} />}
    </section>
  );
}
