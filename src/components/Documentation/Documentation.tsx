// skipcq: JS-W1028
import React from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { UsageSection, OverviewSection, OutlooksSection, CategoricalSection } from './DocumentationContent';
import './Documentation.css';

interface DocumentationProps {
  onClose?: () => void;
}

const Documentation: React.FC<DocumentationProps> = ({ onClose }) => {
  return (
    <div className="documentation">
      <div className="doc-header">
        <h2>Help &amp; Documentation</h2>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close documentation panel"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="w-full grid grid-cols-4 mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="outlooks">Outlooks</TabsTrigger>
          <TabsTrigger value="conversion">Conversion</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewSection />
        </TabsContent>
        <TabsContent value="usage">
          <UsageSection />
        </TabsContent>
        <TabsContent value="outlooks">
          <OutlooksSection />
        </TabsContent>
        <TabsContent value="conversion">
          <CategoricalSection />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Documentation;
