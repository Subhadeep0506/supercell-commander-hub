import { useMemo, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTheme, type Theme } from '@/theme/ThemeProvider';
import { Button } from './Button';

export type SheetVariant = 'book' | 'plain';

/**
 * Share of the window a sheet may occupy.
 *
 * The height is **definite**, not a `maxHeight`, and that is the whole point.
 * The body below is `flex: 1`, which means `flexBasis: 0`; Yoga treats that as
 * a literal 0px, so against a content-sized card the body contributed nothing,
 * the card collapsed to its header, and every sheet rendered as a title above
 * an empty strip on Android. The web never showed it because CSS resolves
 * `flex-basis: 0%` against an indefinite height as `auto`.
 *
 * 80% also keeps the card clear of the system bars. `edgeToEdgeEnabled` is on,
 * so the window height includes them and the previous `height - 24` ran
 * underneath -- taking the scroll out of reach on the clan sheet.
 */
const MAX_HEIGHT = 0.8;

/**
 * Replaces the Radix dialog used by the Clash Book and unit modals
 * (`.book-overlay` + `.book-modal`), built on React Native's own Modal so the
 * project needs neither reanimated nor gesture-handler.
 *
 * Two chromes:
 *
 *  - `book` (default) is the brown bound-volume frame the Clash Book and unit
 *    details use. It is a dialog about one catalog entry.
 *  - `plain` is a near-fullscreen dark panel for the clan detail sheet, which
 *    is a *page* rather than a dialog -- scrolling content, its own sections,
 *    and sub-views it can navigate into. Wrapping that in a book frame would
 *    claim it is a catalog entry, which it is not.
 *
 * Passing `onBack` turns the header's left slot into a back arrow; the sheet
 * uses this to step between the clan, capital raids and war log views without
 * stacking a second Modal.
 *
 * One deliberate difference from the reference: it blurs the backdrop with
 * `backdrop-filter: blur(3px)`. React Native has no equivalent, so the scrim
 * is a flat translucent colour. Listed on the fidelity punch-list.
 */
export function Sheet({
  open,
  onClose,
  onBack,
  title,
  variant = 'book',
  children,
}: {
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  title: ReactNode;
  variant?: SheetVariant;
  children: ReactNode;
}) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const s = useMemo(() => build(theme), [theme]);
  const plain = variant === 'plain';

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      // Android's hardware back steps the sub-view stack before it closes the
      // sheet, matching the header's own back arrow.
      onRequestClose={onBack ?? onClose}
    >
      <View style={[s.overlay, plain && s.overlayPlain]}>
        {/*
          The scrim is a sibling of the card, not its parent. Nesting it would
          close the sheet on every tap inside: react-native-web implements
          Pressable with DOM events, which bubble, so an inner press also fires
          the outer one. (Native's responder system does not, which is exactly
          how this slips through if only the device is tested.)
        */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close"
        />
        <View
          style={[
            s.card,
            plain ? s.cardPlain : null,
            plain
              ? { width: Math.min(560, width - 12), height: Math.min(960, height * MAX_HEIGHT) }
              : { width: Math.min(760, width - 24), height: Math.min(880, height * MAX_HEIGHT) },
          ]}
        >
          <View style={[s.header, plain && s.headerPlain]}>
            {onBack ? (
              <Button
                variant="ghost"
                size="icon"
                accessibilityLabel="Back"
                onPress={onBack}
                style={s.back}
                textStyle={s.backText}
              >
                ←
              </Button>
            ) : null}
            {typeof title === 'string' ? (
              <Text style={[s.title, plain && s.titlePlain]} numberOfLines={2}>
                {title}
              </Text>
            ) : (
              <View style={s.titleSlot}>{title}</View>
            )}
            <Button
              variant={plain ? 'outline' : 'destructive'}
              size="icon"
              // Distinct from the scrim's own "Close", so the two are
              // separately addressable.
              accessibilityLabel={plain ? 'Close sheet' : 'Close item details'}
              onPress={onClose}
              style={[s.close, plain && s.closePlain]}
              textStyle={s.closeText}
            >
              ×
            </Button>
          </View>
          <View style={[s.body, plain && s.bodyPlain]}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

const build = (t: Theme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: t.bookOverlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
    },
    overlayPlain: { padding: 6 },
    card: {
      backgroundColor: t.bookFrame,
      borderWidth: 3,
      borderColor: t.bookFrameLight,
      borderRadius: 8,
      overflow: 'hidden',
      ...t.shadow.book,
    },
    cardPlain: {
      backgroundColor: t.background,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 12,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: t.bookFrameLight,
    },
    // The mock's page header: flat dark bar under a primary rule, which is the
    // same treatment TopBar gives the game chooser.
    headerPlain: {
      gap: 10,
      paddingHorizontal: 10,
      backgroundColor: t.card,
      borderBottomWidth: 2,
      borderBottomColor: t.primary,
    },
    titleSlot: { flex: 1, minWidth: 0 },
    title: { flex: 1, minWidth: 0, color: t.bookFrameText, fontFamily: t.fonts.display, fontSize: 16 },
    titlePlain: { color: t.primary, fontSize: 18 },
    back: { width: 38, height: 38, flexShrink: 0 },
    backText: { fontSize: 24, color: t.cocHighlight },
    close: { width: 34, height: 34, borderWidth: 2, borderColor: t.bookFrame, flexShrink: 0 },
    closePlain: { borderColor: t.border },
    closeText: { fontSize: 20 },
    body: {
      flex: 1,
      backgroundColor: t.card,
      margin: 8,
      borderRadius: 6,
      overflow: 'hidden',
    },
    // Edge to edge: the plain sheet's children bring their own padding, and an
    // inset card inside a full-height panel reads as a second frame.
    bodyPlain: { backgroundColor: t.background, margin: 0, borderRadius: 0 },
  });
