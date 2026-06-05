import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const API_BASE_URL = 'https://www.medicaidready.org';

const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }, { code: 'DC', name: 'Washington, DC' },
];

type Phase = 'quiz' | 'email' | 'loading' | 'result' | 'error';

type EligibilityResult = {
  id: string | null;
  qualified: boolean;
  summary: string;
};

type ApiResponse = {
  ok: boolean;
  id?: string | null;
  qualified?: boolean;
  summary?: string;
  error?: string;
  message?: string;
};

const TOTAL_STEPS = 5;

function cleanSummaryText(value: string): string {
  let cleaned = String(value ?? '')
    .replace(/^\s*```(?:json|text|markdown)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/\\n\\n/g, '\n\n')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as { summary?: string };
    if (parsed.summary) return String(parsed.summary).trim();
  } catch {
    // Continue cleanup below if response is malformed JSON text.
  }

  const summaryMatch = cleaned.match(/"summary"\s*:\s*"([\s\S]*)"\s*\}?\s*$/);
  if (summaryMatch?.[1]) {
    cleaned = summaryMatch[1]
      .replace(/\\"/g, '"')
      .replace(/\\n\\n/g, '\n\n')
      .replace(/\\n/g, '\n')
      .trim();
  }

  return cleaned
    .replace(/"\s*\}+\s*$/g, '')
    .replace(/\}+\s*$/g, '')
    .replace(/^"+|"+$/g, '')
    .trim();
}

async function parseApiResponse(response: Response): Promise<ApiResponse> {
  const text = await response.text();

  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    return {
      ok: false,
      error: 'invalid_api_response',
      message: text || 'The server returned an unreadable response.',
    };
  }
}

export default function HomeScreen() {
  const [phase, setPhase] = useState<Phase>('quiz');
  const [step, setStep] = useState(1);
  const [state, setState] = useState('');
  const [householdSize, setHouseholdSize] = useState(1);
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [age, setAge] = useState('');
  const [employed, setEmployed] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [apiError, setApiError] = useState('');
  const [result, setResult] = useState<EligibilityResult | null>(null);

  const selectedStateName = useMemo(
    () => US_STATES.find((item) => item.code === state)?.name ?? 'your state',
    [state]
  );

  const progress = Math.round((step / TOTAL_STEPS) * 100);

  const resultParagraphs = useMemo(() => {
    return cleanSummaryText(result?.summary ?? '')
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);
  }, [result?.summary]);

  function canAdvance() {
    if (step === 1) return state !== '';
    if (step === 2) return householdSize >= 1;
    if (step === 3) return monthlyIncome !== '' && !Number.isNaN(Number(monthlyIncome));
    if (step === 4) return age !== '' && !Number.isNaN(Number(age)) && Number(age) > 0;
    if (step === 5) return employed !== null;
    return false;
  }

  function handleNext() {
    if (!canAdvance()) return;

    if (step < TOTAL_STEPS) {
      setStep((current) => current + 1);
      return;
    }

    setPhase('email');
  }

  function handleBack() {
    if (phase === 'email') {
      setPhase('quiz');
      setStep(TOTAL_STEPS);
      return;
    }

    if (step > 1) setStep((current) => current - 1);
  }

  async function handleSubmitEmail() {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setEmailError('Please enter a valid email address.');
      return;
    }

    setEmailError('');
    setApiError('');
    setPhase('loading');

    try {
      const formBody = new URLSearchParams({
        email: trimmedEmail,
        state,
        householdSize: String(householdSize),
        monthlyIncome: String(Number(monthlyIncome)),
        age: String(Number(age)),
        employed: employed === true ? 'true' : 'false',
      });

      const response = await fetch(`${API_BASE_URL}/api/check-eligibility`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: formBody.toString(),
      });

      const json = await parseApiResponse(response);

      if (!response.ok || !json.ok) {
        throw new Error(json.message || json.error || 'Something went wrong. Please try again.');
      }

      setResult({
        id: json.id ?? null,
        qualified: Boolean(json.qualified),
        summary: cleanSummaryText(String(json.summary ?? '')),
      });
      setPhase('result');
    } catch (error: unknown) {
      setApiError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
      setPhase('error');
    }
  }

  async function openGuideCheckout() {
    await Linking.openURL(`${API_BASE_URL}/pricing`);
  }

  function resetQuiz() {
    setPhase('quiz');
    setStep(1);
    setState('');
    setHouseholdSize(1);
    setMonthlyIncome('');
    setAge('');
    setEmployed(null);
    setEmail('');
    setEmailError('');
    setApiError('');
    setResult(null);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.brand}>
            Medicaid<Text style={styles.brandGold}>Ready</Text>
          </Text>
          <Text style={styles.title}>
            {phase === 'result' ? 'Your Eligibility Results' : 'Free Medicaid Eligibility Check'}
          </Text>
          {(phase === 'quiz' || phase === 'email') && (
            <Text style={styles.subtitle}>
              Answer 5 quick questions. We check your eligibility against your state&apos;s current Medicaid rules.
            </Text>
          )}
        </View>

        {phase === 'quiz' && (
          <View style={styles.card}>
            <View style={styles.progressTop}>
              <Text style={styles.progressText}>Step {step} of {TOTAL_STEPS}</Text>
              <Text style={styles.progressText}>{progress}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>

            {step === 1 && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>What state do you live in?</Text>
                <Text style={styles.hint}>Select your current state of residence.</Text>
                <View style={styles.stateGrid}>
                  {US_STATES.map((item) => (
                    <Pressable
                      key={item.code}
                      onPress={() => setState(item.code)}
                      style={[styles.stateButton, state === item.code && styles.stateButtonActive]}
                    >
                      <Text style={[styles.stateButtonText, state === item.code && styles.stateButtonTextActive]}>
                        {item.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {step === 2 && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>How many people are in your household?</Text>
                <Text style={styles.hint}>Include yourself, a spouse, and any dependents living with you.</Text>
                <View style={styles.sizeGrid}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
                    <Pressable
                      key={item}
                      onPress={() => setHouseholdSize(item)}
                      style={[styles.sizeButton, householdSize === item && styles.sizeButtonActive]}
                    >
                      <Text style={[styles.sizeButtonText, householdSize === item && styles.sizeButtonTextActive]}>
                        {item === 8 ? '8+' : item}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {step === 3 && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>What is your monthly household income?</Text>
                <Text style={styles.hint}>Include all income sources for everyone in your household before taxes.</Text>
                <View style={styles.moneyInputWrap}>
                  <Text style={styles.moneyPrefix}>$</Text>
                  <TextInput
                    value={monthlyIncome}
                    onChangeText={setMonthlyIncome}
                    keyboardType="number-pad"
                    placeholder="e.g. 2500"
                    placeholderTextColor="#8A99A8"
                    style={styles.moneyInput}
                  />
                </View>
                <Text style={styles.note}>Enter 0 if you have no income right now.</Text>
              </View>
            )}

            {step === 4 && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>What is your age?</Text>
                <Text style={styles.hint}>Age affects eligibility — children, seniors, and adults qualify under different rules.</Text>
                <TextInput
                  value={age}
                  onChangeText={setAge}
                  keyboardType="number-pad"
                  placeholder="e.g. 34"
                  placeholderTextColor="#8A99A8"
                  style={styles.input}
                />
              </View>
            )}

            {step === 5 && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Are you currently employed?</Text>
                <Text style={styles.hint}>
                  Being employed does not automatically disqualify you. Medicaid is mainly based on income and household size.
                </Text>
                <View style={styles.yesNoRow}>
                  <Pressable
                    onPress={() => setEmployed(true)}
                    style={[styles.yesNoButton, employed === true && styles.yesNoButtonActive]}
                  >
                    <Text style={[styles.yesNoText, employed === true && styles.yesNoTextActive]}>Yes</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setEmployed(false)}
                    style={[styles.yesNoButton, employed === false && styles.yesNoButtonActive]}
                  >
                    <Text style={[styles.yesNoText, employed === false && styles.yesNoTextActive]}>No</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <View style={styles.navRow}>
              {step > 1 && (
                <Pressable onPress={handleBack} style={styles.backButton}>
                  <Text style={styles.backButtonText}>‹ Back</Text>
                </Pressable>
              )}
              <Pressable
                onPress={handleNext}
                disabled={!canAdvance()}
                style={[styles.nextButton, !canAdvance() && styles.nextButtonDisabled]}
              >
                <Text style={styles.nextButtonText}>{step === TOTAL_STEPS ? 'See My Results' : 'Continue'} ›</Text>
              </Pressable>
            </View>
          </View>
        )}

        {phase === 'email' && (
          <View style={styles.card}>
            <Text style={styles.emailIcon}>✉</Text>
            <Text style={styles.emailTitle}>Almost there</Text>
            <Text style={styles.emailSubtitle}>
              Enter your email to receive your personalized eligibility assessment. We will not spam you.
            </Text>

            <Text style={styles.label}>Your email address</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@example.com"
              placeholderTextColor="#8A99A8"
              style={[styles.input, emailError ? styles.inputError : null]}
            />
            {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

            <View style={styles.navRow}>
              <Pressable onPress={handleBack} style={styles.backButton}>
                <Text style={styles.backButtonText}>‹ Back</Text>
              </Pressable>
              <Pressable onPress={handleSubmitEmail} style={styles.nextButton}>
                <Text style={styles.nextButtonText}>Get My Results ›</Text>
              </Pressable>
            </View>
          </View>
        )}

        {phase === 'loading' && (
          <View style={styles.cardCenter}>
            <ActivityIndicator size="large" color="#0A3D6B" />
            <Text style={styles.loadingTitle}>Checking your eligibility</Text>
            <Text style={styles.loadingText}>
              We are reviewing your answers against Medicaid rules for {selectedStateName}.
            </Text>
          </View>
        )}

        {phase === 'result' && result && (
          <View style={styles.card}>
            <Text style={styles.resultBadge}>{result.qualified ? 'Likely eligible' : 'Review recommended'}</Text>
            <Text style={styles.resultTitle}>
              {result.qualified ? 'You may qualify for Medicaid.' : 'You may still have coverage options.'}
            </Text>

            {resultParagraphs.length > 0 ? (
              resultParagraphs.map((paragraph, index) => (
                <Text key={`${paragraph}-${index}`} style={styles.resultParagraph}>
                  {paragraph}
                </Text>
              ))
            ) : (
              <Text style={styles.resultParagraph}>
                Your result is ready. Please review your state Medicaid options and next steps.
              </Text>
            )}

            <Pressable onPress={openGuideCheckout} style={styles.guideButton}>
              <Text style={styles.guideButtonText}>Buy Complete Medicaid Guide — $9.99</Text>
            </Pressable>

            <Pressable onPress={resetQuiz} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Start Over</Text>
            </Pressable>
          </View>
        )}

        {phase === 'error' && (
          <View style={styles.card}>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorText}>{apiError || 'Please try again.'}</Text>
            <Pressable onPress={() => setPhase('email')} style={styles.nextButtonFull}>
              <Text style={styles.nextButtonText}>Try Again</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Important notice</Text>
          <Text style={styles.noticeText}>
            MedicaidReady is not a government agency and does not make final eligibility decisions.
            This tool provides an estimate only. Your state Medicaid agency determines final eligibility.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F8FB' },
  container: { padding: 20, paddingBottom: 44 },
  header: { paddingTop: 14, paddingBottom: 20 },
  brand: { color: '#0A3D6B', fontSize: 18, fontWeight: '900', marginBottom: 18 },
  brandGold: { color: '#C8942F' },
  title: { color: '#102A43', fontSize: 34, fontWeight: '900', lineHeight: 40, letterSpacing: -0.7 },
  subtitle: { color: '#52606D', fontSize: 16, lineHeight: 24, marginTop: 12 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, shadowColor: '#0B2545', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  cardCenter: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: '#0B2545', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressText: { color: '#52606D', fontSize: 13, fontWeight: '800' },
  progressTrack: { height: 8, backgroundColor: '#E5EEF7', borderRadius: 999, marginBottom: 24, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: '#0A3D6B', borderRadius: 999 },
  fieldGroup: { gap: 10 },
  label: { color: '#102A43', fontSize: 21, fontWeight: '900', lineHeight: 27 },
  hint: { color: '#64748B', fontSize: 15, lineHeight: 22, marginBottom: 10 },
  stateGrid: { gap: 8 },
  stateButton: { borderWidth: 1, borderColor: '#D9E2EC', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, backgroundColor: '#FFFFFF' },
  stateButtonActive: { backgroundColor: '#0A3D6B', borderColor: '#0A3D6B' },
  stateButtonText: { color: '#243B53', fontSize: 15, fontWeight: '800' },
  stateButtonTextActive: { color: '#FFFFFF' },
  sizeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sizeButton: { width: 68, height: 56, borderRadius: 16, borderWidth: 1, borderColor: '#D9E2EC', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  sizeButtonActive: { backgroundColor: '#0A3D6B', borderColor: '#0A3D6B' },
  sizeButtonText: { color: '#243B53', fontSize: 18, fontWeight: '900' },
  sizeButtonTextActive: { color: '#FFFFFF' },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#D9E2EC', borderRadius: 16, color: '#102A43', fontSize: 18, paddingHorizontal: 14, paddingVertical: 14, marginTop: 12 },
  inputError: { borderColor: '#C2410C' },
  moneyInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#D9E2EC', borderRadius: 16, marginTop: 4 },
  moneyPrefix: { color: '#52606D', fontSize: 20, fontWeight: '900', paddingLeft: 14 },
  moneyInput: { flex: 1, color: '#102A43', fontSize: 18, paddingHorizontal: 10, paddingVertical: 14 },
  note: { color: '#64748B', fontSize: 13, marginTop: 6 },
  yesNoRow: { flexDirection: 'row', gap: 12 },
  yesNoButton: { flex: 1, borderWidth: 1, borderColor: '#D9E2EC', borderRadius: 16, alignItems: 'center', paddingVertical: 16, backgroundColor: '#FFFFFF' },
  yesNoButtonActive: { backgroundColor: '#0A3D6B', borderColor: '#0A3D6B' },
  yesNoText: { color: '#243B53', fontSize: 17, fontWeight: '900' },
  yesNoTextActive: { color: '#FFFFFF' },
  navRow: { flexDirection: 'row', gap: 12, marginTop: 24, alignItems: 'center', justifyContent: 'space-between' },
  backButton: { paddingVertical: 14, paddingHorizontal: 12 },
  backButtonText: { color: '#0A3D6B', fontSize: 16, fontWeight: '900' },
  nextButton: { flex: 1, backgroundColor: '#0A3D6B', borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  nextButtonFull: { backgroundColor: '#0A3D6B', borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  nextButtonDisabled: { backgroundColor: '#9FB3C8' },
  nextButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  emailIcon: { fontSize: 36, marginBottom: 12 },
  emailTitle: { color: '#102A43', fontSize: 28, fontWeight: '900', marginBottom: 8 },
  emailSubtitle: { color: '#52606D', fontSize: 16, lineHeight: 24, marginBottom: 18 },
  errorText: { color: '#C2410C', fontSize: 14, lineHeight: 21, marginTop: 8 },
  errorTitle: { color: '#9A3412', fontSize: 24, fontWeight: '900', marginBottom: 8 },
  loadingTitle: { color: '#102A43', fontSize: 23, fontWeight: '900', marginTop: 18, marginBottom: 8 },
  loadingText: { color: '#52606D', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  resultBadge: { alignSelf: 'flex-start', backgroundColor: '#E8F7EF', color: '#16794C', fontSize: 13, fontWeight: '900', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, overflow: 'hidden', marginBottom: 14 },
  resultTitle: { color: '#102A43', fontSize: 28, fontWeight: '900', lineHeight: 34, marginBottom: 14 },
  resultParagraph: { color: '#334E68', fontSize: 16, lineHeight: 25, marginBottom: 12 },
  guideButton: { backgroundColor: '#C8942F', borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 14 },
  guideButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  secondaryButton: { borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  secondaryButtonText: { color: '#0A3D6B', fontSize: 15, fontWeight: '900' },
  noticeCard: { marginTop: 18, backgroundColor: '#FFF7E6', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#F7D794' },
  noticeTitle: { color: '#7C4D00', fontSize: 15, fontWeight: '900', marginBottom: 6 },
  noticeText: { color: '#5C4200', fontSize: 14, lineHeight: 21 },
});