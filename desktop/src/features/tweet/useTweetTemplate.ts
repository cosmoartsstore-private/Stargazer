import { useEffect, useRef, useState } from 'react';
import { getSetting, setSetting } from '@/db';
import {
  getOpenEventContext,
  isCurrentEventContext,
  waitForEventWritesToSettle,
} from '@/db/repositories/commandContext';
import { getMsg } from '@/messages/getMsg';
import {
  DEFAULT_TWEET_TEMPLATE,
  resolveTweetTemplate,
  TWEET_TEMPLATE_KEY,
} from './tweetTemplate';

/** イベント単位の投稿テンプレートを読み書きし、失敗時の復元を調停する。 */
export function useTweetTemplate(currentEventName: string | null, previewMode = false) {
  const [template, setTemplate] = useState(DEFAULT_TWEET_TEMPLATE);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<{
    eventName: string | null;
    status: 'ready' | 'loading' | 'failed';
  }>({ eventName: null, status: 'ready' });

  // 世代番号と最新入力値により、遅れて完了した読み書きが新しい編集を上書きしないようにする。
  const mutationGenerationRef = useRef(0);
  const templateValueRef = useRef(DEFAULT_TWEET_TEMPLATE);
  const canEditTemplate = previewMode || (
    currentEventName !== null
    && loadState.eventName === currentEventName
    && loadState.status === 'ready'
  );
  const canEditTemplateRef = useRef(canEditTemplate);
  canEditTemplateRef.current = canEditTemplate;
  const isLoading = currentEventName !== null && (
    loadState.eventName !== currentEventName || loadState.status === 'loading'
  );

  useEffect(() => {
    // イベント境界で世代を更新し、前イベントの表示値と通知を引き継がない。
    const mutationGeneration = mutationGenerationRef.current + 1;
    mutationGenerationRef.current = mutationGeneration;
    templateValueRef.current = DEFAULT_TWEET_TEMPLATE;
    setTemplate(DEFAULT_TWEET_TEMPLATE);
    setAlertMessage(null);
    setLoadState({
      eventName: currentEventName,
      status: currentEventName === null ? 'ready' : 'loading',
    });

    // ガイド内の実画面見本ではDBへ接続せず、固定テンプレートだけを表示する。
    if (previewMode) {
      setLoadState({ eventName: currentEventName, status: 'ready' });
      return undefined;
    }

    const context = getOpenEventContext(currentEventName);
    if (context === null) {
      if (currentEventName !== null) {
        setLoadState({ eventName: currentEventName, status: 'failed' });
        setAlertMessage(getMsg('TweetPage.loadFailed'));
      }
      return undefined;
    }
    let isCurrentRequest = true;
    void (async () => {
      try {
        await waitForEventWritesToSettle(context);
        if (
          !isCurrentRequest
          || !isCurrentEventContext(context)
          || mutationGenerationRef.current !== mutationGeneration
        ) return;
        const saved = await getSetting(TWEET_TEMPLATE_KEY);
        if (
          !isCurrentRequest
          || !isCurrentEventContext(context)
          || mutationGenerationRef.current !== mutationGeneration
        ) return;
        const nextTemplate = resolveTweetTemplate(saved);
        templateValueRef.current = nextTemplate;
        setTemplate(nextTemplate);
        setLoadState({ eventName: currentEventName, status: 'ready' });
      } catch {
        if (
          !isCurrentRequest
          || !isCurrentEventContext(context)
          || mutationGenerationRef.current !== mutationGeneration
        ) return;
        setLoadState({ eventName: currentEventName, status: 'failed' });
        setAlertMessage(getMsg('TweetPage.loadFailed'));
      }
    })();

    return () => {
      isCurrentRequest = false;
    };
  }, [currentEventName, previewMode]);

  const persistTemplate = (value: string, mutationGeneration: number) => {
    const context = getOpenEventContext(currentEventName);
    if (context === null) return;
    void setSetting(TWEET_TEMPLATE_KEY, value).catch(async () => {
      if (
        !isCurrentEventContext(context)
        || mutationGenerationRef.current !== mutationGeneration
      ) return;
      try {
        await waitForEventWritesToSettle(context);
        if (
          !isCurrentEventContext(context)
          || mutationGenerationRef.current !== mutationGeneration
        ) return;
        const saved = await getSetting(TWEET_TEMPLATE_KEY);
        if (
          !isCurrentEventContext(context)
          || mutationGenerationRef.current !== mutationGeneration
        ) return;
        const nextTemplate = resolveTweetTemplate(saved);
        templateValueRef.current = nextTemplate;
        setTemplate(nextTemplate);
        setAlertMessage(getMsg('TweetPage.saveFailedRestored'));
      } catch {
        if (
          isCurrentEventContext(context)
          && mutationGenerationRef.current === mutationGeneration
        ) {
          setAlertMessage(getMsg('TweetPage.saveFailedReloadRequired'));
        }
      }
    });
  };

  const updateTemplate = (value: string) => {
    if (!canEditTemplateRef.current) return;
    const mutationGeneration = mutationGenerationRef.current + 1;
    mutationGenerationRef.current = mutationGeneration;
    templateValueRef.current = value;
    setTemplate(value);
    if (previewMode) return;
    persistTemplate(value, mutationGeneration);
  };

  const appendPlaceholder = (key: string) => {
    updateTemplate(templateValueRef.current + key);
  };

  return {
    template,
    canEditTemplate,
    isLoading,
    alertMessage,
    setAlertMessage,
    updateTemplate,
    appendPlaceholder,
  };
}
