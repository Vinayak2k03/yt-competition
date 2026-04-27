import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Key, Youtube, Play, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface OnboardingChecklistProps {
  hasApiKeys: boolean;
  hasChannels: boolean;
  hasScans: boolean;
  isAdmin: boolean;
  onRunScan: () => void;
  isScanning: boolean;
}

export function OnboardingChecklist({
  hasApiKeys,
  hasChannels,
  hasScans,
  isAdmin,
  onRunScan,
  isScanning,
}: OnboardingChecklistProps) {
  const steps = [
    {
      id: 'api-keys',
      title: 'Add YouTube API Keys',
      description: 'Configure at least one YouTube API key for data fetching',
      completed: hasApiKeys,
      href: '/api-keys',
      icon: Key,
      adminOnly: true,
    },
    {
      id: 'channels',
      title: 'Add Channels to Track',
      description: 'Add YouTube channels you want to monitor',
      completed: hasChannels,
      href: '/channels',
      icon: Youtube,
      adminOnly: true,
    },
    {
      id: 'scan',
      title: 'Run Your First Scan',
      description: 'Scan for live streams across your tracked channels',
      completed: hasScans,
      action: onRunScan,
      actionLabel: isScanning ? 'Scanning...' : 'Run Scan',
      actionDisabled: !hasApiKeys || !hasChannels || isScanning,
      icon: Play,
      adminOnly: false,
    },
  ];

  const visibleSteps = steps.filter(s => isAdmin || !s.adminOnly);
  const completedSteps = visibleSteps.filter(s => s.completed).length;
  const progress = (completedSteps / visibleSteps.length) * 100;

  // If all steps are complete, don't show the checklist
  if (completedSteps === visibleSteps.length && hasScans) {
    return null;
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="text-2xl">👋</span>
          Welcome! Let's get you set up
        </CardTitle>
        <CardDescription>
          Complete these steps to start tracking YouTube live streams
        </CardDescription>
        <div className="flex items-center gap-3 pt-2">
          <Progress value={progress} className="flex-1 h-2" />
          <span className="text-sm text-muted-foreground font-medium">
            {completedSteps}/{visibleSteps.length}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleSteps.map((step, index) => {
          const StepIcon = step.icon;
          const isNextStep = !step.completed && visibleSteps.slice(0, index).every(s => s.completed);
          
          return (
            <div
              key={step.id}
              className={`flex items-center gap-4 p-3 rounded-lg transition-colors ${
                step.completed 
                  ? 'bg-muted/30' 
                  : isNextStep 
                    ? 'bg-primary/10 border border-primary/20' 
                    : 'bg-muted/10'
              }`}
            >
              <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                step.completed ? 'bg-green-500/20' : 'bg-muted'
              }`}>
                {step.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <StepIcon className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className={`font-medium ${step.completed ? 'text-muted-foreground line-through' : ''}`}>
                  {step.title}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {step.description}
                </p>
              </div>
              
              {!step.completed && (
                step.href ? (
                  <Link to={step.href}>
                    <Button variant={isNextStep ? 'default' : 'outline'} size="sm" className="gap-1">
                      {isNextStep ? 'Set up' : 'View'}
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                ) : step.action ? (
                  <Button 
                    variant={isNextStep ? 'default' : 'outline'} 
                    size="sm"
                    onClick={step.action}
                    disabled={step.actionDisabled}
                  >
                    {step.actionLabel}
                  </Button>
                ) : null
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
