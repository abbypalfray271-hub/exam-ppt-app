'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-6 bg-red-50/80 border border-red-200 rounded-2xl my-4 text-red-600 gap-3 shadow-sm w-full">
          <AlertCircle className="w-8 h-8 opacity-80" />
          <h3 className="font-bold tracking-widest text-sm uppercase">内容渲染异常隔离</h3>
          <p className="text-xs text-red-500 opacity-90 text-center break-words w-full max-w-sm">
            该区域包含了无法被浏览器安全渲染的非法指令。<br/>
            <span className="font-mono mt-2 block opacity-70 border bg-white/50 p-2 rounded">{this.state.error?.message}</span>
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
