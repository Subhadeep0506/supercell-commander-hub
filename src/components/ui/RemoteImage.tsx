import { useState } from 'react';
import { Image, type ImageSourcePropType, type ImageStyle, type StyleProp } from 'react-native';

/**
 * An image fetched at runtime, with a bundled fallback.
 *
 * This is the only place the app loads artwork off the network. Clan badges
 * are player-assembled from layers and crests, so there is no fixed set that
 * could ever be bundled -- it is remote or nothing. They come from Supercell's
 * own CDN, which may be unreachable on a restricted network, so a failure has
 * to degrade rather than leave a hole in the row.
 */
export function RemoteImage({
  uri,
  fallback,
  style,
  accessibilityLabel,
}: {
  uri?: string;
  fallback?: ImageSourcePropType;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}) {
  const [failed, setFailed] = useState(false);
  const source = !failed && uri ? { uri } : fallback;
  if (!source) return null;
  return (
    <Image
      source={source}
      style={style}
      resizeMode="contain"
      accessibilityLabel={accessibilityLabel}
      onError={() => setFailed(true)}
    />
  );
}
