import type { GetSettingsRequest, SaveSettingsRequest, GetSourcesRequest, SaveVocabSettingsRequest } from '../../shared/messages';
import { getSettings, saveSettings, saveVocabSettings } from '../storage';
import { getEnabledSources } from '../translator';

export async function handleGetSettings(_req: GetSettingsRequest) {
  const settings = await getSettings();
  return { type: 'SETTINGS_RESULT', ...settings };
}

export async function handleSaveSettings(req: SaveSettingsRequest) {
  await saveSettings(req.translators, req.preferences);
  return { type: 'SETTINGS_RESULT', translators: req.translators, preferences: req.preferences };
}

export async function handleGetSources(_req: GetSourcesRequest) {
  const sources = await getEnabledSources();
  return { type: 'SOURCES_RESULT', sources };
}

export async function handleSaveVocabSettings(req: SaveVocabSettingsRequest) {
  await saveVocabSettings(req.settings);
  return { type: 'VOCAB_SETTINGS_RESULT', settings: req.settings };
}
