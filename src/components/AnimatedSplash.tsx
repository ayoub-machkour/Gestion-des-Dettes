import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { colors, font } from '../theme';

// Garde l'écran natif (logo sur fond blanc) jusqu'à ce que l'animation prenne le relais.
SplashScreen.preventAutoHideAsync().catch(() => {});

const LOGO_SIZE = 160; // même taille que l'écran natif (app.json : imageWidth) : transition invisible

/** Logo centré qui grossit légèrement, puis le nom de l'app apparaît, puis tout s'efface vers l'accueil. */
export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const logoScale = useRef(new Animated.Value(1)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleShift = useRef(new Animated.Value(12)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    const ease = Easing.out(Easing.cubic);
    Animated.sequence([
      Animated.timing(logoScale, { toValue: 1.12, duration: 450, easing: ease, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(logoScale, { toValue: 1, duration: 350, easing: ease, useNativeDriver: true }),
        Animated.timing(titleOpacity, { toValue: 1, duration: 450, easing: ease, useNativeDriver: true }),
        Animated.timing(titleShift, { toValue: 0, duration: 450, easing: ease, useNativeDriver: true }),
      ]),
      Animated.delay(650),
      Animated.timing(screenOpacity, { toValue: 0, duration: 350, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => onDone());
  }, [logoScale, titleOpacity, titleShift, screenOpacity, onDone]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.screen, { opacity: screenOpacity }]} pointerEvents="none">
      <Animated.Image source={require('../../assets/splash-icon.png')} style={[s.logo, { transform: [{ scale: logoScale }] }]} />
      <Animated.View style={[s.titleBox, { opacity: titleOpacity, transform: [{ translateY: titleShift }] }]}>
        <Animated.Text style={s.title}>AgriCompte</Animated.Text>
        <Animated.Text style={s.subtitle}>الفلاح</Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  screen: { backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
  // Positionné sous le logo sans le déplacer : le logo reste exactement au centre, comme l'écran natif.
  titleBox: { position: 'absolute', top: '50%', marginTop: LOGO_SIZE / 2 + 8, alignItems: 'center' },
  title: { fontSize: font.xl, fontWeight: '800', color: colors.primary, letterSpacing: 0.3 },
  subtitle: { fontSize: font.lg, fontWeight: '600', color: colors.accent, marginTop: 2 },
});
