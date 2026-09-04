import type { ResourceSpec } from "./kinds/provisioning";

/**
 * Fusionne des patches JSON opaques sur une configuration de driver, dans l'ordre (un patch plus
 * tardif écrase les clés posées par un patch antérieur).
 *
 * Ni le noyau ni cette fonction ne savent ce que les clés signifient (Proxmox, ou tout autre
 * driver) — c'est le rôle du descripteur de provisioning (`ProvisioningDescriptor.parseProductConfig`)
 * de les interpréter, en aval de cette fusion.
 */
export function mergeDriverConfig(
  base: unknown,
  patches: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const baseRecord =
    typeof base === "object" && base !== null && !Array.isArray(base)
      ? (base as Record<string, unknown>)
      : {};
  return patches.reduce<Record<string, unknown>>((acc, patch) => ({ ...acc, ...patch }), {
    ...baseRecord,
  });
}

/**
 * Extrait les seules clés génériques que le noyau connaît (`cpu`, `ramMb`, `diskGb`, voir
 * `ResourceSpec`) d'une suite de patches opaques, pour les fusionner sur une spécification de
 * base. Les autres clés d'un patch (ex. `templateRef`) restent dans `driverConfig` : elles ne
 * transitent jamais par `spec`, qui est le seul canal générique partagé par tous les drivers.
 */
export function mergeResourceSpec(
  base: ResourceSpec | null,
  patches: Array<Record<string, unknown>>,
): ResourceSpec | null {
  const merged = patches.reduce<Partial<ResourceSpec>>(
    (acc, patch) => ({
      ...acc,
      ...(typeof patch.cpu === "number" ? { cpu: patch.cpu } : {}),
      ...(typeof patch.ramMb === "number" ? { ramMb: patch.ramMb } : {}),
      ...(typeof patch.diskGb === "number" ? { diskGb: patch.diskGb } : {}),
    }),
    {},
  );
  if (!base && Object.keys(merged).length === 0) {
    return null;
  }
  return {
    cpu: merged.cpu ?? base?.cpu ?? 0,
    ramMb: merged.ramMb ?? base?.ramMb ?? 0,
    diskGb: merged.diskGb ?? base?.diskGb ?? 0,
  };
}
