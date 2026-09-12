import React from 'react';
import { Clock, Activity, ListFilter, FileText, Code2, Layers } from 'lucide-react';
import { ViewSpec } from '../../types';
import { ViewContainer } from './ViewContainer';
import { TimeCardView } from './TimeCardView';
import { MetricsCardView } from './MetricsCardView';
import { ListCardView } from './ListCardView';
import { KeyValueCardView } from './KeyValueCardView';
import { TextCardView } from './TextCardView';

interface ViewRendererProps {
  view: ViewSpec;
  onTogglePin: (id: string) => void;
  onClose: (id: string) => void;
  onPositionChange: (id: string, pos: { x: number; y: number }) => void;
}

export const ViewRenderer: React.FC<ViewRendererProps> = ({
  view,
  onTogglePin,
  onClose,
  onPositionChange
}) => {
  const getIcon = () => {
    switch (view.type) {
      case 'time':
        return <Clock className="w-3.5 h-3.5" />;
      case 'metrics':
        return <Activity className="w-3.5 h-3.5" />;
      case 'list':
        return <ListFilter className="w-3.5 h-3.5" />;
      case 'key_value':
        return <Layers className="w-3.5 h-3.5" />;
      case 'text':
        return <FileText className="w-3.5 h-3.5" />;
      default:
        return <Code2 className="w-3.5 h-3.5" />;
    }
  };

  const renderContent = () => {
    switch (view.type) {
      case 'time':
        return <TimeCardView data={view.data} />;
      case 'metrics':
        return <MetricsCardView data={view.data} />;
      case 'list':
        return <ListCardView data={view.data} />;
      case 'key_value':
        return <KeyValueCardView data={view.data} />;
      case 'text':
        return <TextCardView data={view.data} />;
      default:
        return (
          <pre className="text-xs font-mono p-3 bg-black/40 rounded-xl overflow-x-auto text-[var(--c-text)]">
            {JSON.stringify(view.data, null, 2)}
          </pre>
        );
    }
  };

  const getWidth = () => {
    if (view.width) return view.width;
    switch (view.type) {
      case 'time':
        return 340;
      case 'metrics':
        return 380;
      case 'list':
        return 420;
      case 'key_value':
        return 360;
      default:
        return 380;
    }
  };

  return (
    <ViewContainer
      id={view.id}
      title={view.title}
      pinned={view.pinned}
      position={view.position}
      width={getWidth()}
      icon={getIcon()}
      onTogglePin={() => onTogglePin(view.id)}
      onClose={() => onClose(view.id)}
      onPositionChange={pos => onPositionChange(view.id, pos)}
    >
      {renderContent()}
    </ViewContainer>
  );
};
