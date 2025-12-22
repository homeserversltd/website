import React, { useState } from 'react';
import { Button, Toggle, Tab, TabGroup, Input, Card, Badge, Checkbox, VisibilityToggle, PlusButton, EditableField, Calendar, TimePicker, RowInfoTile, Select, Slider, TextBox, Breadcrumbs, IconButton, FileInput, ProgressBar, Table, Collapsible } from '../../../../src/components/ui';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHome, faUser, faCog, faCheck, faTimes, faRotate, faSync, faRefresh, faChevronRight, faChevronDown, faFolder } from '@fortawesome/free-solid-svg-icons';
import { useModal } from '../../../../src/hooks/useModal';
import './ComponentShowcase.css';

export const ComponentShowcase: React.FC = () => {
  const { open: openModal, close: closeModal } = useModal();
  
  const [toggleStates, setToggleStates] = useState({
    toggle1: false,
    toggle2: true,
    toggle3: false,
  });

  const [checkboxStates, setCheckboxStates] = useState({
    checkbox1: true,
    checkbox2: false,
    checkbox3: true,
    checkbox4: false,
  });

  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');
  const [activeShowcaseTab, setActiveShowcaseTab] = useState('buttons');
  const [selectedTiles, setSelectedTiles] = useState<Record<string, boolean>>({});
  const [calendarWeeklyValue, setCalendarWeeklyValue] = useState('');
  const [calendarMonthlyValue, setCalendarMonthlyValue] = useState('');
  const [timePickerValue, setTimePickerValue] = useState('03:00');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [selectError, setSelectError] = useState('');
  const [sliderValue1, setSliderValue1] = useState(50);
  const [sliderValue2, setSliderValue2] = useState(25);
  const [sliderValue3, setSliderValue3] = useState(75);
  const [sliderValue4, setSliderValue4] = useState(50);
  const [breadcrumbPath, setBreadcrumbPath] = useState('/mnt/nas/media/kids');
  const [fileInputFiles, setFileInputFiles] = useState<FileList | null>(null);
  const [logContent, setLogContent] = useState(`[2025-12-08 18:53:57] [INFO] Starting reinstallation of premium tab: testTab
[2025-12-08 18:53:57] [INFO] Tab 'testTab' is currently installed, proceeding with reinstall
[2025-12-08 18:53:57] [INFO] Step 1: Uninstalling current installation
[2025-12-08 18:53:59] [INFO] Step 2: Reinstalling tab
[2025-12-08 18:54:00] [INFO] Python requirements installed successfully
[2025-12-08 18:54:04] [INFO] NPM patch applied successfully
[2025-12-08 18:55:13] [INFO] Frontend build completed
[2025-12-08 18:55:28] [INFO] Premium tab 'testTab' reinstalled successfully`);
  const [codeContent] = useState(`function calculateTotal(items) {
  return items.reduce((sum, item) => {
    return sum + (item.price * item.quantity);
  }, 0);
}

const cart = [
  { price: 19.99, quantity: 2 },
  { price: 5.50, quantity: 3 },
  { price: 12.00, quantity: 1 }
];

const total = calculateTotal(cart);
console.log(\`Total: $\${total.toFixed(2)}\`);`);
  const [terminalContent] = useState(`$ npm install -g serve
$ serve -s build

   ┌─────────────────────────────────────┐
   │                                     │
   │   Serving!                          │
   │                                     │
   │   - Local:    http://localhost:3000 │
   │   - Network:  http://192.168.1.100  │
   │                                     │
   └─────────────────────────────────────┘`);

  const handleToggleChange = (key: string) => (checked: boolean) => {
    setToggleStates(prev => ({ ...prev, [key]: checked }));
  };

  const handleCheckboxChange = (key: string) => (checked: boolean) => {
    setCheckboxStates(prev => ({ ...prev, [key]: checked }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    if (value.length > 0 && value.length < 3) {
      setInputError('Input must be at least 3 characters');
    } else {
      setInputError('');
    }
  };

  return (
    <div className="component-showcase">
      <TabGroup>
        <Tab
          active={activeShowcaseTab === 'buttons'}
          onClick={() => setActiveShowcaseTab('buttons')}
          depth={3}
        >
          Buttons
        </Tab>
        <Tab
          active={activeShowcaseTab === 'toggles'}
          onClick={() => setActiveShowcaseTab('toggles')}
          depth={3}
        >
          Toggles
        </Tab>
        <Tab
          active={activeShowcaseTab === 'tabs'}
          onClick={() => setActiveShowcaseTab('tabs')}
          depth={3}
        >
          Tabs
        </Tab>
        <Tab
          active={activeShowcaseTab === 'inputs'}
          onClick={() => setActiveShowcaseTab('inputs')}
          depth={3}
        >
          Inputs
        </Tab>
        <Tab
          active={activeShowcaseTab === 'cards'}
          onClick={() => setActiveShowcaseTab('cards')}
          depth={3}
        >
          Cards
        </Tab>
        <Tab
          active={activeShowcaseTab === 'badges'}
          onClick={() => setActiveShowcaseTab('badges')}
          depth={3}
        >
          Badges
        </Tab>
        <Tab
          active={activeShowcaseTab === 'checkboxes'}
          onClick={() => setActiveShowcaseTab('checkboxes')}
          depth={3}
        >
          Checkboxes
        </Tab>
        <Tab
          active={activeShowcaseTab === 'utilities'}
          onClick={() => setActiveShowcaseTab('utilities')}
          depth={3}
        >
          Utilities
        </Tab>
        <Tab
          active={activeShowcaseTab === 'calendar-time'}
          onClick={() => setActiveShowcaseTab('calendar-time')}
          depth={3}
        >
          Calendar & Time
        </Tab>
        <Tab
          active={activeShowcaseTab === 'row-info-tile'}
          onClick={() => setActiveShowcaseTab('row-info-tile')}
          depth={3}
        >
          Row Info Tile
        </Tab>
        <Tab
          active={activeShowcaseTab === 'dropdowns'}
          onClick={() => setActiveShowcaseTab('dropdowns')}
          depth={3}
        >
          Dropdowns
        </Tab>
        <Tab
          active={activeShowcaseTab === 'slider'}
          onClick={() => setActiveShowcaseTab('slider')}
          depth={3}
        >
          Slider
        </Tab>
        <Tab
          active={activeShowcaseTab === 'textbox'}
          onClick={() => setActiveShowcaseTab('textbox')}
          depth={3}
        >
          Text Box
        </Tab>
        <Tab
          active={activeShowcaseTab === 'upload-components'}
          onClick={() => setActiveShowcaseTab('upload-components')}
          depth={3}
        >
          Upload Components
        </Tab>
        <Tab
          active={activeShowcaseTab === 'progress-bar'}
          onClick={() => setActiveShowcaseTab('progress-bar')}
          depth={3}
        >
          Progress Bar
        </Tab>
        <Tab
          active={activeShowcaseTab === 'table'}
          onClick={() => setActiveShowcaseTab('table')}
          depth={3}
        >
          Table
        </Tab>
        <Tab
          active={activeShowcaseTab === 'collapsible'}
          onClick={() => setActiveShowcaseTab('collapsible')}
          depth={3}
        >
          Collapsible
        </Tab>
        <Tab
          active={activeShowcaseTab === 'modals'}
          onClick={() => setActiveShowcaseTab('modals')}
          depth={3}
        >
          Modals
        </Tab>
      </TabGroup>

      <div className="showcase-content">
        {activeShowcaseTab === 'buttons' && (
          <div className="showcase-section">
            <h3>Button Variants</h3>
            <div className="showcase-grid">
              <div className="showcase-item">
                <h4>Primary</h4>
                <Button variant="primary">Primary Button</Button>
                <Button variant="primary" icon={<FontAwesomeIcon icon={faHome} />}>
                  With Icon
                </Button>
                <Button variant="primary" loading>
                  Loading
                </Button>
                <Button variant="primary" disabled>
                  Disabled
                </Button>
              </div>

              <div className="showcase-item">
                <h4>Secondary</h4>
                <Button variant="secondary">Secondary Button</Button>
                <Button variant="secondary" icon={<FontAwesomeIcon icon={faUser} />} iconPosition="right">
                  Icon Right
                </Button>
                <Button variant="secondary" disabled>
                  Disabled
                </Button>
              </div>

              <div className="showcase-item">
                <h4>Danger</h4>
                <Button variant="danger">Danger Button</Button>
                <Button variant="danger" disabled>
                  Disabled
                </Button>
              </div>

              <div className="showcase-item">
                <h4>Warning</h4>
                <Button variant="warning">Warning Button</Button>
                <Button variant="warning" disabled>
                  Disabled
                </Button>
              </div>

              <div className="showcase-item">
                <h4>Success</h4>
                <Button variant="success">Success Button</Button>
                <Button variant="success" disabled>
                  Disabled
                </Button>
              </div>
            </div>

            <h3>Button Sizes</h3>
            <div className="showcase-row">
              <Button variant="primary" size="small">Small</Button>
              <Button variant="primary" size="medium">Medium</Button>
              <Button variant="primary" size="large">Large</Button>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'toggles' && (
          <div className="showcase-section">
            <h3>Toggle Switches</h3>
            <div className="showcase-grid">
              <div className="showcase-item">
                <h4>Small</h4>
                <Toggle
                  size="small"
                  checked={toggleStates.toggle1}
                  onChange={handleToggleChange('toggle1')}
                  label="Small Toggle"
                />
              </div>

              <div className="showcase-item">
                <h4>Medium (Default)</h4>
                <Toggle
                  size="medium"
                  checked={toggleStates.toggle2}
                  onChange={handleToggleChange('toggle2')}
                  label="Medium Toggle"
                />
              </div>

              <div className="showcase-item">
                <h4>Large</h4>
                <Toggle
                  size="large"
                  checked={toggleStates.toggle3}
                  onChange={handleToggleChange('toggle3')}
                  label="Large Toggle"
                />
              </div>

              <div className="showcase-item">
                <h4>Without Label</h4>
                <Toggle
                  checked={toggleStates.toggle1}
                  onChange={handleToggleChange('toggle1')}
                  aria-label="Toggle without label"
                />
              </div>

              <div className="showcase-item">
                <h4>Disabled</h4>
                <Toggle
                  checked={false}
                  onChange={() => {}}
                  label="Disabled Off"
                  disabled
                />
                <Toggle
                  checked={true}
                  onChange={() => {}}
                  label="Disabled On"
                  disabled
                />
              </div>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'tabs' && (
          <div className="showcase-section">
            <h3>Tab Navigation</h3>
            <div className="showcase-item">
              <h4>Basic Tabs</h4>
              <TabGroup>
                <Tab active icon={<FontAwesomeIcon icon={faHome} />}>Home</Tab>
                <Tab>Profile</Tab>
                <Tab active={false}>Settings</Tab>
                <Tab disabled>Disabled</Tab>
              </TabGroup>
            </div>

            <div className="showcase-item">
              <h4>Tab States</h4>
              <TabGroup>
                <Tab active>Active Tab</Tab>
                <Tab>Inactive Tab</Tab>
                <Tab disabled>Disabled Tab</Tab>
              </TabGroup>
            </div>

            <div className="showcase-item">
              <h4>Visibility States (Admin Mode)</h4>
              <TabGroup>
                <Tab active visible adminMode>Visible Tab</Tab>
                <Tab visible={false} adminMode>Hidden Tab</Tab>
                <Tab visible adminMode>Another Visible</Tab>
              </TabGroup>
            </div>

            <div className="showcase-item">
              <h4>Starred States</h4>
              <TabGroup>
                <Tab active starred>Starred Tab</Tab>
                <Tab starred={false}>Not Starred</Tab>
                <Tab starred>Another Starred</Tab>
              </TabGroup>
            </div>

            <div className="showcase-item">
              <h4>All States Combined</h4>
              <TabGroup>
                <Tab active visible starred adminMode>Active, Visible, Starred</Tab>
                <Tab visible={false} starred adminMode>Hidden, Starred</Tab>
                <Tab visible starred={false} adminMode>Visible, Not Starred</Tab>
                <Tab visible={false} starred={false} adminMode>Hidden, Not Starred</Tab>
              </TabGroup>
            </div>

            <div className="showcase-item">
              <h4>Admin Only Tab</h4>
              <TabGroup>
                <Tab active adminOnly>Admin Only Tab</Tab>
                <Tab adminOnly>Another Admin Only</Tab>
              </TabGroup>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'inputs' && (
          <div className="showcase-section">
            <h3>Input Fields</h3>
            <div className="showcase-grid">
              <div className="showcase-item">
                <h4>Text Input</h4>
                <Input
                  type="text"
                  label="Username"
                  placeholder="Enter username"
                  value={inputValue}
                  onChange={handleInputChange}
                />
              </div>

              <div className="showcase-item">
                <h4>Input with Error</h4>
                <Input
                  type="text"
                  label="Email"
                  placeholder="Enter email"
                  error={inputError}
                  value={inputValue}
                  onChange={handleInputChange}
                />
              </div>

              <div className="showcase-item">
                <h4>Password Input</h4>
                <Input
                  type="password"
                  label="Password"
                  placeholder="Enter password"
                />
              </div>

              <div className="showcase-item">
                <h4>Required Field</h4>
                <Input
                  type="text"
                  label="Required Field"
                  placeholder="This field is required"
                  required
                />
              </div>

              <div className="showcase-item">
                <h4>Disabled Input</h4>
                <Input
                  type="text"
                  label="Disabled"
                  value="Cannot edit"
                  disabled
                />
              </div>

              <div className="showcase-item">
                <h4>Display Variant</h4>
                <p style={{ fontSize: '0.9em', color: 'var(--secondary)', marginBottom: '0.75rem' }}>
                  Dark background with accent-colored text, centered. Perfect for password displays and read-only values.
                </p>
                <div style={{ padding: '1rem', background: 'var(--hiddenTabBackground)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <p style={{ marginBottom: '0.5rem', color: 'var(--text)' }}>
                    <strong>Important:</strong> When importing the certificate bundle, use the following password:
                  </p>
                  <Input
                    type="text"
                    variant="display"
                    value="homeserver"
                    readOnly
                  />
                  <p style={{ fontSize: '0.8em', marginTop: '1em', padding: '0.5em', backgroundColor: 'var(--background-light)', borderRadius: '4px', color: 'var(--secondary)' }}>
                    <strong>Note:</strong> If you change your Tailnet name settings, you will need to generate a new certificate and distribute it to each user to prevent browser warnings over the tailscale connection.
                  </p>
                </div>
              </div>

              <div className="showcase-item">
                <h4>Input Sizes</h4>
                <Input
                  type="text"
                  label="Small"
                  size="small"
                  placeholder="Small input"
                />
                <Input
                  type="text"
                  label="Medium"
                  size="medium"
                  placeholder="Medium input"
                />
                <Input
                  type="text"
                  label="Large"
                  size="large"
                  placeholder="Large input"
                />
              </div>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'cards' && (
          <div className="showcase-section">
            <h3>Cards</h3>
            <div className="showcase-grid">
              <div className="showcase-item">
                <h4>Default Card</h4>
                <Card>
                  <p>This is a default card with some content.</p>
                </Card>
              </div>

              <div className="showcase-item">
                <h4>Card with Header</h4>
                <Card
                  header="Card Header"
                >
                  <p>Card body content goes here.</p>
                </Card>
              </div>

              <div className="showcase-item">
                <h4>Card with Footer</h4>
                <Card
                  footer={<Button variant="primary" size="small">Action</Button>}
                >
                  <p>Card with footer actions.</p>
                </Card>
              </div>

              <div className="showcase-item">
                <h4>Clickable Card</h4>
                <Card
                  variant="clickable"
                  onClick={() => alert('Card clicked!')}
                >
                  <p>Click this card to interact.</p>
                </Card>
              </div>

              <div className="showcase-item">
                <h4>Active Card</h4>
                <Card variant="active">
                  <p>This card indicates an active state.</p>
                </Card>
              </div>

              <div className="showcase-item">
                <h4>Error Card</h4>
                <Card variant="error">
                  <p>This card indicates an error state.</p>
                </Card>
              </div>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'badges' && (
          <div className="showcase-section">
            <h3>Badges</h3>
            <div className="showcase-grid">
              <div className="showcase-item">
                <h4>Badge Variants</h4>
                <div className="showcase-row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Badge variant="primary">Primary</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="success">Success</Badge>
                  <Badge variant="warning">Warning</Badge>
                  <Badge variant="danger">Danger</Badge>
                  <Badge variant="info">Info</Badge>
                </div>
              </div>

              <div className="showcase-item">
                <h4>Badge Sizes</h4>
                <div className="showcase-row" style={{ gap: '0.5rem', alignItems: 'center' }}>
                  <Badge variant="primary" size="small">Small</Badge>
                  <Badge variant="primary" size="medium">Medium</Badge>
                  <Badge variant="primary" size="large">Large</Badge>
                </div>
              </div>

              <div className="showcase-item">
                <h4>Badge Usage Examples</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    Status: <Badge variant="success">Online</Badge>
                  </div>
                  <div>
                    Count: <Badge variant="primary">42</Badge>
                  </div>
                  <div>
                    Alert: <Badge variant="danger">Critical</Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'checkboxes' && (
          <div className="showcase-section">
            <h3>Checkboxes</h3>
            <div className="showcase-grid">
              <div className="showcase-item">
                <h4>Basic Checkboxes</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <Checkbox
                    checked={checkboxStates.checkbox1}
                    onChange={handleCheckboxChange('checkbox1')}
                    label="Checked checkbox"
                  />
                  <Checkbox
                    checked={checkboxStates.checkbox2}
                    onChange={handleCheckboxChange('checkbox2')}
                    label="Unchecked checkbox"
                  />
                  <Checkbox
                    checked={checkboxStates.checkbox3}
                    onChange={handleCheckboxChange('checkbox3')}
                    label="Another checked"
                  />
                </div>
              </div>

              <div className="showcase-item">
                <h4>Checkbox Sizes</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <Checkbox
                    size="small"
                    checked={checkboxStates.checkbox1}
                    onChange={handleCheckboxChange('checkbox1')}
                    label="Small checkbox"
                  />
                  <Checkbox
                    size="medium"
                    checked={checkboxStates.checkbox2}
                    onChange={handleCheckboxChange('checkbox2')}
                    label="Medium checkbox"
                  />
                  <Checkbox
                    size="large"
                    checked={checkboxStates.checkbox3}
                    onChange={handleCheckboxChange('checkbox3')}
                    label="Large checkbox"
                  />
                </div>
              </div>

              <div className="showcase-item">
                <h4>Disabled Checkboxes</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <Checkbox
                    checked={false}
                    onChange={() => {}}
                    label="Disabled unchecked"
                    disabled
                  />
                  <Checkbox
                    checked={true}
                    onChange={() => {}}
                    label="Disabled checked"
                    disabled
                  />
                </div>
              </div>

              <div className="showcase-item">
                <h4>Stats Tab Style (Grouped)</h4>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '1rem',
                  background: 'var(--hiddenTabBackground)',
                  padding: '1rem',
                  borderRadius: '4px'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    padding: '4px 8px',
                    background: 'var(--background)',
                    borderRadius: '4px'
                  }}>
                    <span style={{ fontWeight: 500, marginRight: '8px' }}>nas</span>
                    <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                      <Checkbox
                        size="small"
                        checked={checkboxStates.checkbox1}
                        onChange={handleCheckboxChange('checkbox1')}
                        label="Read"
                      />
                      <Checkbox
                        size="small"
                        checked={checkboxStates.checkbox2}
                        onChange={handleCheckboxChange('checkbox2')}
                        label="Write"
                      />
                    </div>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    padding: '4px 8px',
                    background: 'var(--background)',
                    borderRadius: '4px'
                  }}>
                    <span style={{ fontWeight: 500, marginRight: '8px' }}>root</span>
                    <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                      <Checkbox
                        size="small"
                        checked={checkboxStates.checkbox3}
                        onChange={handleCheckboxChange('checkbox3')}
                        label="Read"
                      />
                      <Checkbox
                        size="small"
                        checked={checkboxStates.checkbox4}
                        onChange={handleCheckboxChange('checkbox4')}
                        label="Write"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'utilities' && (
          <div className="showcase-section">
            <h3>Utility Components</h3>
            <div className="showcase-grid">
              <div className="showcase-item">
                <h4>Visibility Toggle</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <VisibilityToggle
                      visible={true}
                      onChange={(v) => console.log('Visible:', v)}
                      size="small"
                    />
                    <span>Small - Visible</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <VisibilityToggle
                      visible={false}
                      onChange={(v) => console.log('Visible:', v)}
                      size="medium"
                    />
                    <span>Medium - Hidden</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <VisibilityToggle
                      visible={true}
                      onChange={(v) => console.log('Visible:', v)}
                      size="large"
                      disabled
                    />
                    <span>Large - Disabled</span>
                  </div>
                </div>
              </div>

              <div className="showcase-item">
                <h4>Plus Button</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start' }}>
                  <PlusButton
                    size="small"
                    onClick={() => console.log('Plus clicked')}
                    aria-label="Add item"
                  />
                  <PlusButton
                    size="medium"
                    onClick={() => console.log('Plus clicked')}
                    aria-label="Add item"
                  />
                  <PlusButton
                    size="large"
                    onClick={() => console.log('Plus clicked')}
                    aria-label="Add item"
                  />
                  <PlusButton
                    variant="secondary"
                    onClick={() => console.log('Plus clicked')}
                    aria-label="Add item"
                  />
                  <PlusButton
                    disabled
                    onClick={() => console.log('Plus clicked')}
                    aria-label="Add item"
                  />
                </div>
              </div>

              <div className="showcase-item">
                <h4>Editable Field</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                  <EditableField
                    value="Click to edit this text"
                    onSave={async (value) => {
                      console.log('Saved:', value);
                    }}
                    placeholder="Enter text here"
                  />
                  <EditableField
                    value=""
                    onSave={async (value) => {
                      console.log('Saved:', value);
                    }}
                    placeholder="Empty field - click to edit"
                  />
                  <EditableField
                    value="Disabled field"
                    onSave={async (value) => {
                      console.log('Saved:', value);
                    }}
                    disabled
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'calendar-time' && (
          <div className="showcase-section">
            <h3>Calendar & Time Picker</h3>
            <div className="showcase-grid">
              <div className="showcase-item">
                <h4>Calendar - Weekly Mode</h4>
                <Calendar
                  frequency="weekly"
                  value={calendarWeeklyValue}
                  onChange={setCalendarWeeklyValue}
                  size="medium"
                />
                {calendarWeeklyValue && (
                  <p style={{ marginTop: '0.5rem', fontSize: '12px', color: 'var(--secondary)' }}>
                    Selected: {calendarWeeklyValue}
                  </p>
                )}
              </div>

              <div className="showcase-item">
                <h4>Calendar - Monthly Mode</h4>
                <Calendar
                  frequency="monthly"
                  value={calendarMonthlyValue}
                  onChange={setCalendarMonthlyValue}
                  size="medium"
                />
                {calendarMonthlyValue && (
                  <p style={{ marginTop: '0.5rem', fontSize: '12px', color: 'var(--secondary)' }}>
                    Selected: {calendarMonthlyValue}
                  </p>
                )}
              </div>

              <div className="showcase-item">
                <h4>Time Picker</h4>
                <TimePicker
                  value={timePickerValue}
                  onChange={setTimePickerValue}
                  size="medium"
                />
                <p style={{ marginTop: '0.5rem', fontSize: '12px', color: 'var(--secondary)' }}>
                  Selected: {timePickerValue} (24-hour format)
                </p>
              </div>

              <div className="showcase-item">
                <h4>Calendar Sizes</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '0.25rem' }}>Small</label>
                    <Calendar
                      frequency="weekly"
                      value=""
                      onChange={() => {}}
                      size="small"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '0.25rem' }}>Medium</label>
                    <Calendar
                      frequency="weekly"
                      value=""
                      onChange={() => {}}
                      size="medium"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '0.25rem' }}>Large</label>
                    <Calendar
                      frequency="weekly"
                      value=""
                      onChange={() => {}}
                      size="large"
                    />
                  </div>
                </div>
              </div>

              <div className="showcase-item">
                <h4>Time Picker Sizes</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '0.25rem' }}>Small</label>
                    <TimePicker
                      value="14:30"
                      onChange={() => {}}
                      size="small"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '0.25rem' }}>Medium</label>
                    <TimePicker
                      value="14:30"
                      onChange={() => {}}
                      size="medium"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '0.25rem' }}>Large</label>
                    <TimePicker
                      value="14:30"
                      onChange={() => {}}
                      size="large"
                    />
                  </div>
                </div>
              </div>

              <div className="showcase-item">
                <h4>Disabled States</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <Calendar
                    frequency="weekly"
                    value="Monday"
                    onChange={() => {}}
                    disabled
                  />
                  <TimePicker
                    value="09:00"
                    onChange={() => {}}
                    disabled
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'row-info-tile' && (
          <div className="showcase-section">
            <h3>Row Info Tile</h3>
            <p style={{ marginBottom: '2rem', color: 'var(--secondary)' }}>
              A flexible row information tile component for displaying structured data with icons, badges, metadata, and actions.
            </p>

            <div className="showcase-grid">
              <div className="showcase-item">
                <h4>Basic Row</h4>
                <RowInfoTile
                  icon="📁"
                  title="Documents"
                  subtitle="Folder"
                />
              </div>

              <div className="showcase-item">
                <h4>With Badges</h4>
                <RowInfoTile
                  icon="📄"
                  title="report.pdf"
                  badges={[
                    { label: 'PDF', variant: 'primary' },
                    { label: '2.3 MB', variant: 'info' }
                  ]}
                />
              </div>

              <div className="showcase-item">
                <h4>With Metadata</h4>
                <RowInfoTile
                  icon="📁"
                  title="backups"
                  metadata={
                    <>
                      <span>Size: 15.2 GB</span>
                      <span>Modified: 7/19/2025</span>
                    </>
                  }
                />
              </div>

              <div className="showcase-item">
                <h4>With Checkbox</h4>
                <RowInfoTile
                  icon="📁"
                  title="Old"
                  subtitle="Directory"
                  showCheckbox
                  selected={selectedTiles['old'] || false}
                  onSelect={(checked) => setSelectedTiles(prev => ({ ...prev, old: checked }))}
                  badges={[{ label: 'Directory', variant: 'success' }]}
                  metadata={<span>7/19/2025, 1:41:54 PM</span>}
                />
              </div>

              <div className="showcase-item">
                <h4>With Actions</h4>
                <RowInfoTile
                  icon="📁"
                  title="documents"
                  subtitle="Directory"
                  onEdit={() => alert('Edit clicked')}
                  onDelete={() => alert('Delete clicked')}
                />
              </div>

              <div className="showcase-item">
                <h4>Selected State</h4>
                <RowInfoTile
                  icon="📁"
                  title="Selected Folder"
                  showCheckbox
                  selected={true}
                  onSelect={() => {}}
                  variant="selected"
                />
              </div>

              <div className="showcase-item">
                <h4>Active Variant</h4>
                <RowInfoTile
                  icon="📁"
                  title="Active Directory"
                  variant="active"
                  badges={[{ label: 'Directory', variant: 'success' }]}
                />
              </div>

              <div className="showcase-item">
                <h4>Error Variant</h4>
                <RowInfoTile
                  icon="⚠️"
                  title="Error File"
                  variant="error"
                  badges={[{ label: 'Error', variant: 'danger' }]}
                />
              </div>

              <div className="showcase-item">
                <h4>Clickable Row</h4>
                <RowInfoTile
                  icon="📁"
                  title="Clickable Folder"
                  subtitle="Double-click to open"
                  onClick={() => alert('Single click')}
                  onDoubleClick={() => alert('Double click')}
                  badges={[{ label: 'Directory', variant: 'success' }]}
                />
              </div>

              <div className="showcase-item">
                <h4>Full Featured</h4>
                <RowInfoTile
                  icon="📁"
                  title="backups"
                  subtitle="Directory"
                  showCheckbox
                  selected={selectedTiles['backups'] || false}
                  onSelect={(checked) => setSelectedTiles(prev => ({ ...prev, backups: checked }))}
                  badges={[
                    { label: 'Directory', variant: 'success' },
                    { label: '15.2 GB', variant: 'info' }
                  ]}
                  metadata={
                    <>
                      <span>Modified: 7/19/2025</span>
                      <span>Items: 42</span>
                    </>
                  }
                  onEdit={() => alert('Edit')}
                  onDelete={() => alert('Delete')}
                  onClick={() => console.log('Row clicked')}
                />
              </div>

              <div className="showcase-item">
                <h4>Disabled State</h4>
                <RowInfoTile
                  icon="📁"
                  title="Disabled Folder"
                  disabled
                  badges={[{ label: 'Directory', variant: 'success' }]}
                />
              </div>

              <div className="showcase-item">
                <h4>Custom Actions</h4>
                <RowInfoTile
                  icon="📁"
                  title="Custom Actions"
                  actions={
                    <>
                      <Button variant="secondary" size="small" onClick={() => alert('Custom 1')}>
                        Action 1
                      </Button>
                      <Button variant="secondary" size="small" onClick={() => alert('Custom 2')}>
                        Action 2
                      </Button>
                    </>
                  }
                />
              </div>
            </div>

            <h3>Usage Examples</h3>
            <div className="showcase-item">
              <h4>FileItem-like Pattern</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <RowInfoTile
                  icon="📁"
                  title="Old"
                  showCheckbox
                  selected={selectedTiles['file1'] || false}
                  onSelect={(checked) => setSelectedTiles(prev => ({ ...prev, file1: checked }))}
                  badges={[{ label: 'Directory', variant: 'success' }]}
                  metadata={<span>7/19/2025, 1:41:54 PM</span>}
                  onEdit={() => alert('Rename')}
                  onDelete={() => alert('Delete')}
                />
                <RowInfoTile
                  icon="📄"
                  title="document.pdf"
                  showCheckbox
                  selected={selectedTiles['file2'] || false}
                  onSelect={(checked) => setSelectedTiles(prev => ({ ...prev, file2: checked }))}
                  badges={[{ label: 'PDF', variant: 'primary' }]}
                  metadata={
                    <>
                      <span>2.3 MB</span>
                      <span>7/18/2025, 3:22:10 PM</span>
                    </>
                  }
                  onEdit={() => alert('Rename')}
                  onDelete={() => alert('Delete')}
                />
              </div>
            </div>

            <div className="showcase-item">
              <h4>RepositoryCard-like Pattern</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <RowInfoTile
                  icon="📦"
                  title="my-repository"
                  showCheckbox
                  selected={selectedTiles['repo1'] || false}
                  onSelect={(checked) => setSelectedTiles(prev => ({ ...prev, repo1: checked }))}
                  badges={[
                    { label: '✓ active', variant: 'success' }
                  ]}
                  metadata={
                    <>
                      <div><strong>Path:</strong> /home/user/repos/my-repo</div>
                      <div><strong>Size:</strong> 45.2 MB</div>
                      <div><strong>Last Commit:</strong> 2 days ago</div>
                    </>
                  }
                />
              </div>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'dropdowns' && (
          <div className="showcase-section">
            <h3>Click-to-Open Dropdowns</h3>
            <p style={{ marginBottom: '2rem', color: 'var(--secondary)' }}>
              Dropdown components that open on click, providing a list of selectable options. Click anywhere on the dropdown trigger to open the options list.
            </p>

            <div className="showcase-grid">
              <div className="showcase-item">
                <h4>Basic Dropdown</h4>
                <Select
                  label="Select Device to Update"
                  value={selectedDevice}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                  options={[
                    { value: 'sdb', label: 'sdb - 🔒 Unlocked' },
                    { value: 'sdc', label: 'sdc - 🔒 Unlocked' },
                    { value: 'sdd', label: 'sdd - 🔒 Locked' },
                  ]}
                  placeholder="Select a device"
                />
                {selectedDevice && (
                  <p style={{ marginTop: '0.5rem', fontSize: '12px', color: 'var(--secondary)' }}>
                    Selected: {selectedDevice}
                  </p>
                )}
              </div>

              <div className="showcase-item">
                <h4>Dropdown with Strategy Options</h4>
                <Select
                  label="Strategy"
                  value={selectedStrategy}
                  onChange={(e) => setSelectedStrategy(e.target.value)}
                  options={[
                    { value: 'safe', label: 'Safe Key Rotation' },
                    { value: 'replace', label: 'Replace Primary Key' },
                    { value: 'add', label: 'Add to Slot 2' },
                  ]}
                  placeholder="Select a strategy"
                />
                {selectedStrategy && (
                  <p style={{ marginTop: '0.5rem', fontSize: '12px', color: 'var(--secondary)' }}>
                    Selected: {selectedStrategy}
                  </p>
                )}
              </div>

              <div className="showcase-item">
                <h4>Required Field</h4>
                <Select
                  label="Required Selection"
                  value=""
                  onChange={() => {}}
                  options={[
                    { value: 'option1', label: 'Option 1' },
                    { value: 'option2', label: 'Option 2' },
                    { value: 'option3', label: 'Option 3' },
                  ]}
                  placeholder="Please select an option"
                  required
                />
              </div>

              <div className="showcase-item">
                <h4>Dropdown with Error</h4>
                <Select
                  label="Select with Error"
                  value=""
                  onChange={() => {}}
                  options={[
                    { value: 'option1', label: 'Option 1' },
                    { value: 'option2', label: 'Option 2' },
                  ]}
                  placeholder="Select an option"
                  error="This field is required"
                />
              </div>

              <div className="showcase-item">
                <h4>Dropdown Sizes</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '0.25rem' }}>Small</label>
                    <Select
                      size="small"
                      value=""
                      onChange={() => {}}
                      options={[
                        { value: '1', label: 'Option 1' },
                        { value: '2', label: 'Option 2' },
                      ]}
                      placeholder="Small dropdown"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '0.25rem' }}>Medium</label>
                    <Select
                      size="medium"
                      value=""
                      onChange={() => {}}
                      options={[
                        { value: '1', label: 'Option 1' },
                        { value: '2', label: 'Option 2' },
                      ]}
                      placeholder="Medium dropdown"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '0.25rem' }}>Large</label>
                    <Select
                      size="large"
                      value=""
                      onChange={() => {}}
                      options={[
                        { value: '1', label: 'Option 1' },
                        { value: '2', label: 'Option 2' },
                      ]}
                      placeholder="Large dropdown"
                    />
                  </div>
                </div>
              </div>

              <div className="showcase-item">
                <h4>Disabled Dropdown</h4>
                <Select
                  label="Disabled Selection"
                  value="option1"
                  onChange={() => {}}
                  options={[
                    { value: 'option1', label: 'Selected Option' },
                    { value: 'option2', label: 'Another Option' },
                  ]}
                  disabled
                />
              </div>

              <div className="showcase-item">
                <h4>Many Options</h4>
                <Select
                  label="Select from Many Options"
                  value=""
                  onChange={() => {}}
                  options={[
                    { value: '1', label: 'First Option' },
                    { value: '2', label: 'Second Option' },
                    { value: '3', label: 'Third Option' },
                    { value: '4', label: 'Fourth Option' },
                    { value: '5', label: 'Fifth Option' },
                    { value: '6', label: 'Sixth Option' },
                    { value: '7', label: 'Seventh Option' },
                    { value: '8', label: 'Eighth Option' },
                  ]}
                  placeholder="Choose from list"
                />
              </div>

              <div className="showcase-item">
                <h4>Form Example</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <Select
                    label="Device"
                    value={selectedDevice}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                    options={[
                      { value: 'sdb', label: 'sdb - 🔒 Unlocked' },
                      { value: 'sdc', label: 'sdc - 🔒 Unlocked' },
                    ]}
                    placeholder="Select a device"
                    required
                  />
                  <Select
                    label="Strategy"
                    value={selectedStrategy}
                    onChange={(e) => {
                      setSelectedStrategy(e.target.value);
                      if (!e.target.value) {
                        setSelectError('Strategy is required');
                      } else {
                        setSelectError('');
                      }
                    }}
                    options={[
                      { value: 'safe', label: 'Safe Key Rotation - Add or replace key in slot 1, preserving the primary key' },
                      { value: 'replace', label: 'Replace Primary Key - Replace the primary key with the NAS key' },
                    ]}
                    placeholder="Select a strategy"
                    error={selectError}
                    required
                  />
                </div>
              </div>
            </div>

            <h3>Usage Notes</h3>
            <div className="showcase-item">
              <ul style={{ color: 'var(--secondary)', lineHeight: '1.6' }}>
                <li>Click anywhere on the dropdown trigger to open the options list</li>
                <li>Options appear in a dropdown menu below the trigger</li>
                <li>Click outside or select an option to close</li>
                <li>Keyboard accessible: Enter/Space to open, Arrow keys to navigate, Enter to select</li>
                <li>Visual indicator (chevron icon) shows dropdown functionality</li>
                <li>Hover effects use <code>--primaryHover</code> color</li>
                <li>Always provide a label for accessibility</li>
                <li>Use descriptive option labels (e.g., "sdb - 🔒 Unlocked")</li>
              </ul>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'slider' && (
          <div className="showcase-section">
            <h3>Slider Component</h3>
            <p style={{ marginBottom: '2rem', color: 'var(--secondary)' }}>
              Range slider component for selecting numeric values within a min/max range. Supports continuous updates while dragging and optional release callback.
            </p>

            <div className="showcase-grid">
              <div className="showcase-item">
                <h4>Basic Slider</h4>
                <Slider
                  min={0}
                  max={100}
                  value={sliderValue1}
                  onChange={setSliderValue1}
                  leftLabel="Min"
                  rightLabel="Max"
                />
                <p style={{ marginTop: '0.5rem', fontSize: '12px', color: 'var(--secondary)' }}>
                  Value: {sliderValue1}
                </p>
              </div>

              <div className="showcase-item">
                <h4>Slider with Labels</h4>
                <Slider
                  min={0}
                  max={100}
                  value={sliderValue2}
                  onChange={setSliderValue2}
                  leftLabel="More Leases"
                  rightLabel="More Reservations"
                />
                <p style={{ marginTop: '0.5rem', fontSize: '12px', color: 'var(--secondary)' }}>
                  Value: {sliderValue2}
                </p>
              </div>

              <div className="showcase-item">
                <h4>Slider with Step</h4>
                <Slider
                  min={0}
                  max={100}
                  value={sliderValue3}
                  onChange={setSliderValue3}
                  step={5}
                  leftLabel="0%"
                  rightLabel="100%"
                />
                <p style={{ marginTop: '0.5rem', fontSize: '12px', color: 'var(--secondary)' }}>
                  Value: {sliderValue3} (step: 5)
                </p>
              </div>

              <div className="showcase-item">
                <h4>Slider with onRelease</h4>
                <Slider
                  min={8}
                  max={247}
                  value={sliderValue4}
                  onChange={setSliderValue4}
                  onRelease={(value) => {
                    console.log('Slider released at:', value);
                    alert(`Value saved: ${value}`);
                  }}
                  leftLabel="Min: 8"
                  rightLabel="Max: 247"
                />
                <p style={{ marginTop: '0.5rem', fontSize: '12px', color: 'var(--secondary)' }}>
                  Value: {sliderValue4} (check console on release)
                </p>
              </div>

              <div className="showcase-item">
                <h4>Slider Sizes</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div>
                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '0.5rem' }}>Small</label>
                    <Slider
                      min={0}
                      max={100}
                      value={50}
                      onChange={() => {}}
                      size="small"
                      leftLabel="0"
                      rightLabel="100"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '0.5rem' }}>Medium (Default)</label>
                    <Slider
                      min={0}
                      max={100}
                      value={50}
                      onChange={() => {}}
                      size="medium"
                      leftLabel="0"
                      rightLabel="100"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '0.5rem' }}>Large</label>
                    <Slider
                      min={0}
                      max={100}
                      value={50}
                      onChange={() => {}}
                      size="large"
                      leftLabel="0"
                      rightLabel="100"
                    />
                  </div>
                </div>
              </div>

              <div className="showcase-item">
                <h4>Disabled Slider</h4>
                <Slider
                  min={0}
                  max={100}
                  value={75}
                  onChange={() => {}}
                  disabled
                  leftLabel="Disabled"
                  rightLabel="Slider"
                />
              </div>

              <div className="showcase-item">
                <h4>Without Labels</h4>
                <Slider
                  min={0}
                  max={100}
                  value={60}
                  onChange={(value) => console.log('Value:', value)}
                  aria-label="Slider without labels"
                />
                <p style={{ marginTop: '0.5rem', fontSize: '12px', color: 'var(--secondary)' }}>
                  Accessible via aria-label
                </p>
              </div>

              <div className="showcase-item">
                <h4>Custom Range</h4>
                <Slider
                  min={10}
                  max={90}
                  value={45}
                  onChange={() => {}}
                  leftLabel="10"
                  rightLabel="90"
                />
                <p style={{ marginTop: '0.5rem', fontSize: '12px', color: 'var(--secondary)' }}>
                  Custom min/max range
                </p>
              </div>

              <div className="showcase-item">
                <h4>DHCP Reservation Example</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <Slider
                    min={8}
                    max={247}
                    value={50}
                    onChange={() => {}}
                    leftLabel="More Leases"
                    rightLabel="More Reservations"
                  />
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    fontSize: '0.75rem', 
                    color: 'var(--secondary)',
                    fontStyle: 'italic',
                    padding: '4px 8px',
                    background: 'var(--hiddenTabBackground)',
                    borderRadius: '4px'
                  }}>
                    <span>Min: 8 (current reservations)</span>
                    <span>Max: 247 (ensuring 2 active hosts minimum)</span>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '0.5rem',
                    padding: '12px',
                    background: 'var(--hiddenTabBackground)',
                    borderRadius: '4px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.9rem', color: 'var(--secondary)' }}>Reserved Range:</span>
                      <span style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>192.168.123.2 - 192.168.123.51</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.9rem', color: 'var(--secondary)' }}>Pool Range:</span>
                      <span style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>192.168.123.52 - 192.168.123.250</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <h3>Usage Notes</h3>
            <div className="showcase-item">
              <ul style={{ color: 'var(--secondary)', lineHeight: '1.6' }}>
                <li>Drag the thumb or use arrow keys to change the value</li>
                <li><code>onChange</code> fires continuously while dragging</li>
                <li><code>onRelease</code> (optional) fires when user stops dragging - useful for saving values</li>
                <li>Visual fill track shows current position using <code>--primary</code> color</li>
                <li>Thumb uses <code>--accent</code> color for visibility</li>
                <li>Track background uses <code>--hiddenTabBackground</code> color</li>
                <li>Supports <code>step</code> prop for discrete value increments</li>
                <li>Keyboard accessible: Arrow keys to adjust, Home/End for min/max</li>
                <li>Always provide labels or <code>aria-label</code> for accessibility</li>
              </ul>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'textbox' && (
          <div className="showcase-section">
            <h3>TextBox Component</h3>
            <p style={{ marginBottom: '2rem', color: 'var(--secondary)' }}>
              Reliable text display component for logs, code, terminal output, and other text content. Supports auto-scroll, custom headers, and action buttons.
            </p>

            <div className="showcase-grid">
              <div className="showcase-item">
                <h4>Log Variant</h4>
                <TextBox
                  variant="log"
                  value={logContent}
                  header="System Logs"
                  actions={
                    <>
                      <Button variant="primary" size="small" onClick={() => {
                        navigator.clipboard.writeText(logContent);
                        alert('Logs copied to clipboard!');
                      }}>
                        Copy
                      </Button>
                      <Button variant="secondary" size="small" onClick={() => {
                        setLogContent(logContent + '\n[2025-12-08 18:56:00] [INFO] Log entry refreshed');
                      }}>
                        Refresh
                      </Button>
                    </>
                  }
                  autoScroll={true}
                  maxHeight="300px"
                />
              </div>

              <div className="showcase-item">
                <h4>Code Variant</h4>
                <TextBox
                  variant="code"
                  value={codeContent}
                  header="Code Preview"
                  maxHeight="300px"
                />
              </div>

              <div className="showcase-item">
                <h4>Terminal Variant</h4>
                <TextBox
                  variant="terminal"
                  value={terminalContent}
                  header="Terminal Output"
                  maxHeight="300px"
                />
              </div>

              <div className="showcase-item">
                <h4>Plain Text</h4>
                <TextBox
                  variant="plain"
                  value="This is a plain text display. It can be used for any text content that doesn't require special formatting. The text wraps naturally and supports scrolling when content exceeds the container height."
                  header="Plain Text Display"
                  maxHeight="200px"
                />
              </div>

              <div className="showcase-item">
                <h4>With Auto-Scroll</h4>
                <TextBox
                  variant="log"
                  value={logContent}
                  header="Live Logs"
                  autoScroll={true}
                  maxHeight="250px"
                />
                <p style={{ fontSize: '12px', color: 'var(--secondary)', marginTop: '0.5rem' }}>
                  Auto-scrolls to bottom when content updates
                </p>
              </div>

              <div className="showcase-item">
                <h4>Without Header</h4>
                <TextBox
                  variant="plain"
                  value="This text box has no header. It's useful for inline text displays or when you want a minimal appearance."
                  maxHeight="150px"
                />
              </div>

              <div className="showcase-item">
                <h4>Text Box Sizes</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '0.25rem' }}>Small</label>
                    <TextBox
                      variant="log"
                      value="[2025-12-08 18:53:57] [INFO] Small text box example"
                      size="small"
                      maxHeight="100px"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '0.25rem' }}>Medium (Default)</label>
                    <TextBox
                      variant="log"
                      value="[2025-12-08 18:53:57] [INFO] Medium text box example"
                      size="medium"
                      maxHeight="100px"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', display: 'block', marginBottom: '0.25rem' }}>Large</label>
                    <TextBox
                      variant="log"
                      value="[2025-12-08 18:53:57] [INFO] Large text box example"
                      size="large"
                      maxHeight="100px"
                    />
                  </div>
                </div>
              </div>

              <div className="showcase-item">
                <h4>Monospace Option</h4>
                <TextBox
                  variant="plain"
                  value="This plain text box uses monospace font for better readability of structured data."
                  header="Monospace Text"
                  monospace={true}
                  maxHeight="150px"
                />
              </div>

              <div className="showcase-item">
                <h4>Non-Scrollable</h4>
                <TextBox
                  variant="plain"
                  value="This text box does not scroll. Content that exceeds the container height will be clipped."
                  header="Fixed Height"
                  scrollable={false}
                  maxHeight="100px"
                />
              </div>

              <div className="showcase-item">
                <h4>With Placeholder</h4>
                <TextBox
                  variant="log"
                  value=""
                  header="Empty Log"
                  placeholder="No log entries yet. Logs will appear here when available."
                  maxHeight="200px"
                />
              </div>

              <div className="showcase-item">
                <h4>Disabled State</h4>
                <TextBox
                  variant="log"
                  value="[2025-12-08 18:53:57] [INFO] This text box is disabled"
                  header="Disabled Log"
                  disabled={true}
                  maxHeight="150px"
                />
              </div>

              <div className="showcase-item">
                <h4>Long Content Example</h4>
                <TextBox
                  variant="log"
                  value={Array.from({ length: 50 }, (_, i) => 
                    `[2025-12-08 ${String(18 + Math.floor(i / 10)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}] [INFO] Log entry ${i + 1}`
                  ).join('\n')}
                  header="Extended Log"
                  actions={
                    <Button variant="secondary" size="small" onClick={() => alert('Clear logs')}>
                      Clear
                    </Button>
                  }
                  autoScroll={false}
                  maxHeight="300px"
                />
              </div>

              <div className="showcase-item">
                <h4>Code with Syntax</h4>
                <TextBox
                  variant="code"
                  value={`// React component example
import React from 'react';

export const MyComponent: React.FC = () => {
  const [count, setCount] = React.useState(0);
  
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  );
};`}
                  header="React Component"
                  maxHeight="300px"
                />
              </div>
            </div>

            <h3>Usage Examples</h3>
            <div className="showcase-item">
              <h4>System Update Logs</h4>
              <TextBox
                variant="log"
                value={logContent}
                header="Update Logs"
                actions={
                  <>
                    <Button variant="primary" size="small" onClick={() => {
                      navigator.clipboard.writeText(logContent);
                      alert('Copied to clipboard!');
                    }}>
                      Copy Contents
                    </Button>
                    <Button variant="secondary" size="small" onClick={() => {
                      setLogContent(logContent + '\n[2025-12-08 18:56:00] [INFO] Log refreshed');
                    }}>
                      Refresh
                    </Button>
                  </>
                }
                autoScroll={true}
                maxHeight="400px"
              />
            </div>

            <div className="showcase-item">
              <h4>Terminal Command Output</h4>
              <TextBox
                variant="terminal"
                value={terminalContent}
                header="Command Output"
                maxHeight="250px"
              />
            </div>

            <h3>Usage Notes</h3>
            <div className="showcase-item">
              <ul style={{ color: 'var(--secondary)', lineHeight: '1.6' }}>
                <li><strong>Variants:</strong> <code>plain</code> (default), <code>log</code> (monospace, log-friendly), <code>code</code> (monospace, code styling), <code>terminal</code> (monospace, terminal styling)</li>
                <li><strong>Sizes:</strong> <code>small</code>, <code>medium</code> (default), <code>large</code></li>
                <li><strong>Header:</strong> Optional header section with title and action buttons</li>
                <li><strong>Auto-scroll:</strong> Automatically scrolls to bottom when content updates (useful for live logs)</li>
                <li><strong>Monospace:</strong> Force monospace font even on plain variant</li>
                <li><strong>Scrollable:</strong> Control whether content can scroll (default: true)</li>
                <li><strong>Max Height:</strong> Set maximum height for the content area</li>
                <li><strong>Placeholder:</strong> Show placeholder text when value is empty</li>
                <li><strong>Disabled:</strong> Disable interaction and show disabled styling</li>
                <li>Log and terminal variants automatically use monospace font</li>
                <li>Code variant uses subtle background color for better readability</li>
                <li>Custom scrollbar styling matches theme colors</li>
                <li>All variants use CSS variables for theming</li>
              </ul>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'upload-components' && (
          <div className="showcase-section">
            <h3>Upload Components</h3>
            <p style={{ color: 'var(--secondary)', marginBottom: '24px' }}>
              New components for the upload tablet: Breadcrumbs, IconButton, and FileInput
            </p>

            <div className="showcase-grid">
              {/* Breadcrumbs */}
              <div className="showcase-item">
                <h4>Breadcrumbs</h4>
                <p style={{ color: 'var(--secondary)', fontSize: '0.9em', marginBottom: '12px' }}>
                  Navigation breadcrumbs for directory paths
                </p>
                <div style={{ padding: '16px', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <Breadcrumbs
                    items={[
                      { name: 'nas', path: '/mnt/nas' },
                      { name: 'media', path: '/mnt/nas/media' },
                      { name: 'kids', path: '/mnt/nas/media/kids' },
                    ]}
                    currentPath={breadcrumbPath}
                    onNavigate={(path) => {
                      setBreadcrumbPath(path);
                      console.log('Navigated to:', path);
                    }}
                  />
                </div>
                <div style={{ marginTop: '12px', padding: '12px', background: 'var(--hiddenTabBackground)', borderRadius: '4px' }}>
                  <p style={{ fontSize: '0.85em', color: 'var(--secondary)', margin: 0 }}>
                    <strong>Current path:</strong> {breadcrumbPath}
                  </p>
                  <div style={{ marginTop: '8px' }}>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => setBreadcrumbPath('/mnt/nas')}
                    >
                      Reset to Root
                    </Button>
                  </div>
                </div>
                <div className="showcase-item" style={{ marginTop: '16px' }}>
                  <h5>Features:</h5>
                  <ul style={{ color: 'var(--secondary)', lineHeight: '1.6', fontSize: '0.9em' }}>
                    <li>Clickable path segments</li>
                    <li>Current path highlighting</li>
                    <li>Customizable separator (default: '/')</li>
                    <li>Keyboard accessible (Enter/Space to navigate)</li>
                    <li>Uses CSS variables for theming</li>
                    <li>Responsive design</li>
                  </ul>
                </div>
              </div>

              {/* IconButton */}
              <div className="showcase-item">
                <h4>IconButton</h4>
                <p style={{ color: 'var(--secondary)', fontSize: '0.9em', marginBottom: '12px' }}>
                  Icon-only button component for actions like refresh, settings, etc.
                </p>
                <div style={{ padding: '16px', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: '0.85em', color: 'var(--secondary)', marginBottom: '4px' }}>Square (default)</p>
                      <IconButton
                        icon={faRotate}
                        onClick={() => console.log('Refresh clicked')}
                        size="small"
                        aria-label="Refresh (small)"
                      />
                      <IconButton
                        icon={faSync}
                        onClick={() => console.log('Sync clicked')}
                        size="medium"
                        aria-label="Sync (medium)"
                      />
                      <IconButton
                        icon={faRefresh}
                        onClick={() => console.log('Refresh clicked')}
                        size="large"
                        aria-label="Refresh (large)"
                      />
                    </div>
                    <div>
                      <p style={{ fontSize: '0.85em', color: 'var(--secondary)', marginBottom: '4px' }}>Circle</p>
                      <IconButton
                        icon={faRotate}
                        onClick={() => console.log('Refresh clicked')}
                        size="small"
                        shape="circle"
                        aria-label="Refresh (small circle)"
                      />
                      <IconButton
                        icon={faSync}
                        onClick={() => console.log('Sync clicked')}
                        size="medium"
                        shape="circle"
                        aria-label="Sync (medium circle)"
                      />
                      <IconButton
                        icon={faRefresh}
                        onClick={() => console.log('Refresh clicked')}
                        size="large"
                        shape="circle"
                        aria-label="Refresh (large circle)"
                      />
                    </div>
                    <div>
                      <p style={{ fontSize: '0.85em', color: 'var(--secondary)', marginBottom: '4px' }}>Variants</p>
                      <IconButton
                        icon={faCog}
                        onClick={() => console.log('Settings clicked')}
                        size="medium"
                        variant="default"
                        aria-label="Settings (default)"
                      />
                      <IconButton
                        icon={faCog}
                        onClick={() => console.log('Settings clicked')}
                        size="medium"
                        variant="primary"
                        aria-label="Settings (primary)"
                      />
                      <IconButton
                        icon={faCog}
                        onClick={() => console.log('Settings clicked')}
                        size="medium"
                        variant="secondary"
                        aria-label="Settings (secondary)"
                      />
                    </div>
                    <div>
                      <p style={{ fontSize: '0.85em', color: 'var(--secondary)', marginBottom: '4px' }}>Disabled</p>
                      <IconButton
                        icon={faRotate}
                        onClick={() => {}}
                        size="medium"
                        disabled
                        aria-label="Refresh (disabled)"
                      />
                    </div>
                  </div>
                </div>
                <div className="showcase-item" style={{ marginTop: '16px' }}>
                  <h5>Features:</h5>
                  <ul style={{ color: 'var(--secondary)', lineHeight: '1.6', fontSize: '0.9em' }}>
                    <li>Icon-only button variant</li>
                    <li>Square or circular shape</li>
                    <li>Size variants: small, medium, large</li>
                    <li>Uses FontAwesome icons</li>
                    <li>Hover effects with --primaryHover</li>
                    <li>Disabled state support</li>
                    <li>Keyboard accessible</li>
                  </ul>
                </div>
              </div>

              {/* FileInput */}
              <div className="showcase-item">
                <h4>FileInput</h4>
                <p style={{ color: 'var(--secondary)', fontSize: '0.9em', marginBottom: '12px' }}>
                  Styled file input with button and display field
                </p>
                <div style={{ padding: '16px', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <FileInput
                    onChange={(files) => {
                      setFileInputFiles(files);
                      console.log('Files selected:', files ? Array.from(files).map(f => f.name) : 'none');
                    }}
                    multiple
                    label="Select Files"
                    buttonText="Choose Files"
                    displayText="No file chosen"
                    size="medium"
                    aria-label="File selection"
                  />
                </div>
                {fileInputFiles && fileInputFiles.length > 0 && (
                  <div style={{ marginTop: '12px', padding: '12px', background: 'var(--hiddenTabBackground)', borderRadius: '4px' }}>
                    <p style={{ fontSize: '0.85em', color: 'var(--secondary)', margin: '0 0 8px 0' }}>
                      <strong>Selected files ({fileInputFiles.length}):</strong>
                    </p>
                    <ul style={{ fontSize: '0.85em', color: 'var(--text)', margin: 0, paddingLeft: '20px' }}>
                      {Array.from(fileInputFiles).map((file, index) => (
                        <li key={index}>{file.name} ({(file.size / 1024).toFixed(2)} KB)</li>
                      ))}
                    </ul>
                    <div style={{ marginTop: '8px' }}>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => {
                          setFileInputFiles(null);
                          console.log('Files cleared');
                        }}
                      >
                        Clear Selection
                      </Button>
                    </div>
                  </div>
                )}
                <div style={{ marginTop: '12px', padding: '12px', background: 'var(--background)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  <FileInput
                    onChange={(files) => console.log('Single file selected:', files ? files[0]?.name : 'none')}
                    multiple={false}
                    accept="image/*"
                    label="Select Image (Single)"
                    buttonText="Choose Image"
                    displayText="No image chosen"
                    size="small"
                    aria-label="Image selection"
                  />
                </div>
                <div style={{ marginTop: '12px', padding: '12px', background: 'var(--background)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  <FileInput
                    onChange={(files) => console.log('Large file input:', files ? Array.from(files).map(f => f.name) : 'none')}
                    multiple
                    label="Select Multiple Files (Large)"
                    buttonText="Choose Files"
                    displayText="No files chosen"
                    size="large"
                    disabled={false}
                    aria-label="Large file selection"
                  />
                </div>
                <div className="showcase-item" style={{ marginTop: '16px' }}>
                  <h5>Features:</h5>
                  <ul style={{ color: 'var(--secondary)', lineHeight: '1.6', fontSize: '0.9em' }}>
                    <li>Styled file input button (uses Button component)</li>
                    <li>Display field showing selected file names or placeholder text</li>
                    <li>Multiple file support</li>
                    <li>File type filtering via accept attribute</li>
                    <li>Size variants: small, medium, large</li>
                    <li>Uses CSS variables for theming</li>
                    <li>Accessible with proper labels and ARIA attributes</li>
                    <li>Responsive design</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'progress-bar' && (
          <div className="showcase-section">
            <h2>Progress Bar Component</h2>
            <p style={{ color: 'var(--secondary)', marginBottom: '24px' }}>
              A flexible progress bar component with variants for different use cases (memory, process, disk).
            </p>

            <div className="showcase-item">
              <h3>Basic Usage</h3>
              <div style={{ marginTop: '16px' }}>
                <ProgressBar value={45} />
              </div>
              <div style={{ marginTop: '16px' }}>
                <ProgressBar value={75} showPercentage={false} />
              </div>
              <div style={{ marginTop: '16px' }}>
                <ProgressBar value={30} label="RAM Usage" />
              </div>
            </div>

            <div className="showcase-item">
              <h3>Variants</h3>
              <div style={{ marginTop: '16px' }}>
                <ProgressBar value={65} variant="memory" label="Memory" />
              </div>
              <div style={{ marginTop: '16px' }}>
                <ProgressBar value={25} variant="swap" label="Swap" />
              </div>
              <div style={{ marginTop: '16px' }}>
                <ProgressBar value={80} variant="process" label="Process CPU" />
              </div>
              <div style={{ marginTop: '16px' }}>
                <ProgressBar value={55} variant="disk" label="Disk Usage" />
              </div>
            </div>

            <div className="showcase-item">
              <h3>Size Variants</h3>
              <div style={{ marginTop: '16px' }}>
                <ProgressBar value={50} size="small" label="Small" />
              </div>
              <div style={{ marginTop: '16px' }}>
                <ProgressBar value={50} size="medium" label="Medium" />
              </div>
              <div style={{ marginTop: '16px' }}>
                <ProgressBar value={50} size="large" label="Large" />
              </div>
            </div>

            <div className="showcase-item">
              <h3>With Labels</h3>
              <div style={{ marginTop: '16px' }}>
                <ProgressBar 
                  value={72} 
                  leftLabel="Used: 7.2 GB" 
                  rightLabel="Total: 10 GB" 
                />
              </div>
              <div style={{ marginTop: '16px' }}>
                <ProgressBar 
                  value={45} 
                  label="CPU Usage"
                  leftLabel="45%" 
                  rightLabel="55% idle" 
                />
              </div>
            </div>

            <div className="showcase-item">
              <h3>Real-World Examples</h3>
              <div style={{ marginTop: '16px', padding: '16px', background: 'var(--background)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                <h4 style={{ marginTop: 0, marginBottom: '12px' }}>System Resources</h4>
                <ProgressBar value={68} variant="memory" label="RAM" leftLabel="Used: 6.8 GB" rightLabel="Available: 3.2 GB" />
                <div style={{ marginTop: '12px' }}>
                  <ProgressBar value={12} variant="swap" label="Swap" leftLabel="Used: 1.2 GB" rightLabel="Free: 8.8 GB" />
                </div>
                <div style={{ marginTop: '12px' }}>
                  <ProgressBar value={85} variant="disk" label="Disk (/dev/sda1)" leftLabel="Used: 850 GB" rightLabel="Free: 150 GB" />
                </div>
              </div>
              <div style={{ marginTop: '16px', padding: '16px', background: 'var(--background)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                <h4 style={{ marginTop: 0, marginBottom: '12px' }}>Process CPU Usage</h4>
                <ProgressBar value={45} variant="process" leftLabel="chrome" rightLabel="45%" />
                <div style={{ marginTop: '8px' }}>
                  <ProgressBar value={32} variant="process" leftLabel="node" rightLabel="32%" />
                </div>
                <div style={{ marginTop: '8px' }}>
                  <ProgressBar value={18} variant="process" leftLabel="python" rightLabel="18%" />
                </div>
              </div>
            </div>

            <div className="showcase-item" style={{ marginTop: '16px' }}>
              <h5>Features:</h5>
              <ul style={{ color: 'var(--secondary)', lineHeight: '1.6', fontSize: '0.9em' }}>
                <li>Percentage-based width (0-100%)</li>
                <li>Optional label/text overlay on the bar</li>
                <li>Variants for different use cases (memory, process, disk, swap)</li>
                <li>Color customization via CSS variables</li>
                <li>Optional left/right labels</li>
                <li>Show/hide percentage text</li>
                <li>Size variants (small, medium, large)</li>
                <li>Accessible with ARIA attributes</li>
                <li>Backward compatible with legacy CSS classes</li>
              </ul>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'table' && (
          <div className="showcase-section">
            <h2>Table Component</h2>
            <p style={{ color: 'var(--secondary)', marginBottom: '24px' }}>
              A responsive table component with header styling, cell borders, and mobile-friendly card layout.
            </p>

            <div className="showcase-item">
              <h3>Basic Table</h3>
              <div style={{ marginTop: '16px' }}>
                <Table
                  headers={['Name', 'Status', 'Value']}
                  rows={[
                    ['Service A', 'Running', '100%'],
                    ['Service B', 'Stopped', '0%'],
                    ['Service C', 'Running', '75%'],
                  ]}
                />
              </div>
            </div>

            <div className="showcase-item">
              <h3>DHCP Leases Example</h3>
              <div style={{ marginTop: '16px' }}>
                <Table
                  headers={['Device Note', 'Hostname', 'IP Address', 'MAC Address']}
                  rows={[
                    ['My Laptop', 'laptop.local', '192.168.1.100', 'aa:bb:cc:dd:ee:ff'],
                    ['Phone', 'phone.local', '192.168.1.101', '11:22:33:44:55:66'],
                    ['Tablet', 'tablet.local', '192.168.1.102', 'ff:ee:dd:cc:bb:aa'],
                  ]}
                  columnSizing={[
                    { minWidth: '200px' },
                    { minWidth: '120px' },
                    { minWidth: '120px' },
                    { minWidth: '150px' },
                  ]}
                />
              </div>
            </div>

            <div className="showcase-item">
              <h3>Network Interfaces Example</h3>
              <div style={{ marginTop: '16px' }}>
                <Table
                  headers={['Interface', 'Label', 'Received', 'Sent']}
                  rows={[
                    ['enp1s0', 'WAN', '1.2 GB', '500 MB'],
                    ['enp2s0', 'LAN', '5.8 GB', '3.2 GB'],
                    ['tailscale0', 'Tailscale VPN', '250 MB', '180 MB'],
                  ]}
                />
              </div>
            </div>

            <div className="showcase-item">
              <h3>With Custom Column Sizing</h3>
              <div style={{ marginTop: '16px' }}>
                <Table
                  headers={['ID', 'Description', 'Status']}
                  rows={[
                    ['001', 'This is a very long description that might wrap', 'Active'],
                    ['002', 'Short', 'Inactive'],
                    ['003', 'Medium length description', 'Pending'],
                  ]}
                  columnSizing={[
                    { minWidth: '60px', width: '10%' },
                    { minWidth: '200px', width: '70%' },
                    { minWidth: '100px', width: '20%' },
                  ]}
                />
              </div>
            </div>

            <div className="showcase-item">
              <h3>Complex Data Example</h3>
              <div style={{ marginTop: '16px' }}>
                <Table
                  headers={['Device', 'Type', 'Mount Point', 'Used', 'Free', 'Total', 'Percent']}
                  rows={[
                    ['/dev/sda1', 'ext4', '/', '850 GB', '150 GB', '1 TB', '85%'],
                    ['/dev/sdb1', 'ext4', '/mnt/storage', '2.5 TB', '500 GB', '3 TB', '83%'],
                    ['/dev/nvme0n1', 'ext4', '/home', '200 GB', '300 GB', '500 GB', '40%'],
                  ]}
                />
              </div>
            </div>

            <div className="showcase-item" style={{ marginTop: '16px' }}>
              <h5>Features:</h5>
              <ul style={{ color: 'var(--secondary)', lineHeight: '1.6', fontSize: '0.9em' }}>
                <li>Header row styling with background color</li>
                <li>Cell border and padding</li>
                <li>Responsive design (mobile stacking)</li>
                <li>Optional column sizing/min-widths</li>
                <li>Header background color (uses --hiddenTabBackground)</li>
                <li>Border styling (uses --border)</li>
                <li>Mobile breakpoints for card-style layout (480px, 768px)</li>
                <li>Accessible with ARIA attributes</li>
                <li>Backward compatible with legacy CSS classes (kea-leases-table, network-interfaces-table)</li>
              </ul>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'collapsible' && (
          <div className="showcase-section">
            <h2>Collapsible Component</h2>
            <p style={{ color: 'var(--secondary)', marginBottom: '24px' }}>
              An expandable/collapsible section component with caret icon, perfect for organizing content into expandable sections.
            </p>

            <div className="showcase-item">
              <h3>Basic Usage</h3>
              <div style={{ marginTop: '16px' }}>
                <Collapsible title="System Settings">
                  <div style={{ padding: '8px 0' }}>
                    <p>This is the collapsible content. It can contain any React elements.</p>
                    <Input label="Shared SSH Password" type="password" defaultValue="••••••••••" />
                    <p style={{ fontSize: '0.85rem', color: 'var(--secondary)', marginTop: '8px' }}>
                      Default root password from your preseed ISO (used for claiming new miners)
                    </p>
                  </div>
                </Collapsible>
              </div>
            </div>

            <div className="showcase-item">
              <h3>Variants</h3>
              <div style={{ marginTop: '16px' }}>
                <Collapsible title="Default Variant" variant="default" style={{ marginBottom: '12px' }}>
                  <p>Default variant with border and background.</p>
                </Collapsible>
                <Collapsible title="Card Variant" variant="card" style={{ marginBottom: '12px' }}>
                  <p>Card variant with enhanced shadow.</p>
                </Collapsible>
                <Collapsible title="Minimal Variant" variant="minimal" style={{ marginBottom: '12px' }}>
                  <p>Minimal variant with no border, clean look.</p>
                </Collapsible>
              </div>
            </div>

            <div className="showcase-item">
              <h3>Size Variants</h3>
              <div style={{ marginTop: '16px' }}>
                <Collapsible title="Extra Small (small)" size="small" style={{ marginBottom: '12px' }}>
                  <p>Extra small size collapsible section - compact and minimal.</p>
                </Collapsible>
                <Collapsible title="Small" size="small" style={{ marginBottom: '12px' }}>
                  <p>Small size collapsible section - slightly more compact than default.</p>
                </Collapsible>
                <Collapsible title="Medium (Default)" size="medium" style={{ marginBottom: '12px' }}>
                  <p>Medium size collapsible section (default) - balanced padding and spacing.</p>
                </Collapsible>
                <Collapsible title="Large" size="large" style={{ marginBottom: '12px' }}>
                  <p>Large size collapsible section - more spacious with larger text.</p>
                </Collapsible>
                <Collapsible title="Extra Large (large)" size="large" style={{ marginBottom: '12px' }}>
                  <p>Extra large size collapsible section - maximum padding and prominent text.</p>
                </Collapsible>
              </div>
            </div>

            <div className="showcase-item">
              <h3>With Header Content</h3>
              <div style={{ marginTop: '16px' }}>
                <Collapsible 
                  title="Monero (XMR)"
                  headerContent={
                    <Badge variant="success" size="small">Running</Badge>
                  }
                >
                  <div style={{ padding: '8px 0' }}>
                    <p>Mining configuration and status for Monero.</p>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <Button size="small">Start Mining</Button>
                      <Button size="small" variant="secondary">Configure</Button>
                    </div>
                  </div>
                </Collapsible>
              </div>
            </div>

            <div className="showcase-item">
              <h3>Default Collapsed</h3>
              <div style={{ marginTop: '16px' }}>
                <Collapsible title="Chia (XCH)" defaultCollapsed={true}>
                  <div style={{ padding: '8px 0' }}>
                    <p>This section starts collapsed by default.</p>
                    <ProgressBar value={45} variant="disk" label="Plot Progress" />
                  </div>
                </Collapsible>
              </div>
            </div>

            <div className="showcase-item">
              <h3>Real-World Example (Miner Tab Style)</h3>
              <div style={{ marginTop: '16px', padding: '16px', background: 'var(--background)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                <h4 style={{ marginTop: 0, marginBottom: '12px' }}>Mining Configuration</h4>
                <Collapsible title="System Settings" variant="card" style={{ marginBottom: '12px' }}>
                  <div style={{ padding: '8px 0' }}>
                    <Input label="Shared SSH Password" type="password" defaultValue="••••••••••" />
                    <p style={{ fontSize: '0.85rem', color: 'var(--secondary)', marginTop: '8px' }}>
                      Default root password from your preseed ISO (used for claiming new miners)
                    </p>
                  </div>
                </Collapsible>
                <Collapsible 
                  title="Monero (XMR)" 
                  variant="card"
                  defaultCollapsed={true}
                  headerContent={<Badge variant="success" size="small">Running</Badge>}
                  style={{ marginBottom: '12px' }}
                >
                  <div style={{ padding: '8px 0' }}>
                    <p>Monero mining configuration and controls.</p>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <Button size="small">Stop Mining</Button>
                      <Button size="small" variant="secondary">Configure Pool</Button>
                    </div>
                  </div>
                </Collapsible>
                <Collapsible 
                  title="Chia (XCH)" 
                  variant="card"
                  defaultCollapsed={true}
                  headerContent={<Badge variant="secondary" size="small">Idle</Badge>}
                  style={{ marginBottom: '12px' }}
                >
                  <div style={{ padding: '8px 0' }}>
                    <p>Chia plotting and farming configuration.</p>
                    <ProgressBar value={65} variant="disk" label="Plot Progress" leftLabel="65 plots" rightLabel="100 total" />
                  </div>
                </Collapsible>
                <Collapsible 
                  title="Raptoreum (RTM)" 
                  variant="card"
                  defaultCollapsed={true}
                  headerContent={<Badge variant="secondary" size="small">Idle</Badge>}
                >
                  <div style={{ padding: '8px 0' }}>
                    <p>Raptoreum mining configuration.</p>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <Button size="small">Start Mining</Button>
                      <Button size="small" variant="secondary">Configure</Button>
                    </div>
                  </div>
                </Collapsible>
              </div>
            </div>

            <div className="showcase-item" style={{ marginTop: '16px' }}>
              <h5>Features:</h5>
              <ul style={{ color: 'var(--secondary)', lineHeight: '1.6', fontSize: '0.9em' }}>
                <li>Clickable header with caret icon (▼) that rotates on expand/collapse</li>
                <li>Optional title and custom header content (badges, icons, etc.)</li>
                <li>Variants: default, card, minimal</li>
                <li>Size variants: xs, small, medium, large, xl</li>
                <li>Default collapsed state option</li>
                <li>onToggle callback for state management</li>
                <li>Smooth animations for expand/collapse</li>
                <li>Keyboard accessible (Enter/Space to toggle)</li>
                <li>ARIA attributes for screen readers</li>
                <li>Backward compatible with legacy CSS classes (.section-header, .section-content, .collapse-icon)</li>
                <li>Uses CSS variables for theming</li>
                <li>Reduced padding by 10% across all sizes for more compact appearance</li>
              </ul>
            </div>
          </div>
        )}

        {activeShowcaseTab === 'modals' && (
          <div className="showcase-section">
            <h3>Modal System</h3>
            <p style={{ marginBottom: '2rem', color: 'var(--secondary)' }}>
              Interactive modal dialogs with various sizes and configurations. Click buttons to see different modal appearances.
            </p>

            <div className="showcase-grid">
              <div className="showcase-item">
                <h4>Small/Medium Modal (Default)</h4>
                <p style={{ fontSize: '0.9em', color: 'var(--secondary)', marginBottom: '0.75rem' }}>
                  Standard modal with default max-width (600px)
                </p>
                <Button
                  variant="primary"
                  onClick={() => openModal(
                    <div style={{ padding: '1rem' }}>
                      <p>This is a standard modal with default sizing.</p>
                      <p style={{ marginTop: '1rem', color: 'var(--secondary)' }}>
                        Max width: 600px, centered on screen.
                      </p>
                    </div>,
                    { title: 'Standard Modal' }
                  )}
                >
                  Open Standard Modal
                </Button>
              </div>

              <div className="showcase-item">
                <h4>Large Modal</h4>
                <p style={{ fontSize: '0.9em', color: 'var(--secondary)', marginBottom: '0.75rem' }}>
                  Wider modal for more content (uses CSS override)
                </p>
                <Button
                  variant="primary"
                  onClick={() => openModal(
                    <div data-modal-size="large" style={{ padding: '1rem' }}>
                      <p>This is a large modal with extended width.</p>
                      <p style={{ marginTop: '1rem', color: 'var(--secondary)' }}>
                        Uses custom CSS to override default max-width (90vw).
                      </p>
                    </div>,
                    { 
                      title: 'Large Modal',
                      hideActions: true
                    }
                  )}
                >
                  Open Large Modal
                </Button>
              </div>

              <div className="showcase-item">
                <h4>Full-Screen Modal</h4>
                <p style={{ fontSize: '0.9em', color: 'var(--secondary)', marginBottom: '0.75rem' }}>
                  Full viewport width and height (like LogViewerModal)
                </p>
                <Button
                  variant="primary"
                  onClick={() => openModal(
                    <div data-modal-size="fullscreen" style={{ padding: '1rem', height: '100%', overflow: 'auto' }}>
                      <h3 style={{ marginTop: 0 }}>Full-Screen Modal</h3>
                      <p>This modal takes up 95% of viewport width and 90% of viewport height.</p>
                      <p style={{ marginTop: '1rem' }}>
                        Perfect for log viewers, large data displays, or complex forms.
                      </p>
                      <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--primary)', borderRadius: '8px' }}>
                        <p style={{ margin: 0 }}>Example content area with scrolling</p>
                        {Array.from({ length: 20 }, (_, i) => (
                          <p key={i} style={{ margin: '0.5rem 0' }}>
                            Scrollable content line {i + 1}
                          </p>
                        ))}
                      </div>
                    </div>,
                    { 
                      title: 'Full-Screen Modal',
                      hideActions: true
                    }
                  )}
                >
                  Open Full-Screen Modal
                </Button>
              </div>

              <div className="showcase-item">
                <h4>Modal Without Title</h4>
                <p style={{ fontSize: '0.9em', color: 'var(--secondary)', marginBottom: '0.75rem' }}>
                  Modal with no header title
                </p>
                <Button
                  variant="primary"
                  onClick={() => openModal(
                    <div style={{ padding: '1rem' }}>
                      <h3 style={{ marginTop: 0 }}>Content Title</h3>
                      <p>This modal has no title in the header. The content provides its own heading.</p>
                    </div>,
                    { hideActions: true }
                  )}
                >
                  Open Modal (No Title)
                </Button>
              </div>

              <div className="showcase-item">
                <h4>Modal With Actions</h4>
                <p style={{ fontSize: '0.9em', color: 'var(--secondary)', marginBottom: '0.75rem' }}>
                  Standard modal with Confirm/Cancel buttons
                </p>
                <Button
                  variant="primary"
                  onClick={() => openModal(
                    <div style={{ padding: '1rem' }}>
                      <p>This modal includes default action buttons (Confirm/Cancel).</p>
                      <p style={{ marginTop: '1rem', color: 'var(--secondary)' }}>
                        Click Confirm to close, or Cancel/× to dismiss.
                      </p>
                    </div>,
                    { 
                      title: 'Modal With Actions',
                      onConfirm: async () => {
                        alert('Confirmed!');
                        return true;
                      }
                    }
                  )}
                >
                  Open Modal (With Actions)
                </Button>
              </div>

              <div className="showcase-item">
                <h4>Modal Without Actions</h4>
                <p style={{ fontSize: '0.9em', color: 'var(--secondary)', marginBottom: '0.75rem' }}>
                  Modal with custom inline actions (hideActions: true)
                </p>
                <Button
                  variant="primary"
                  onClick={() => openModal(
                    <div style={{ padding: '1rem' }}>
                      <p>This modal has no default action buttons.</p>
                      <p style={{ marginTop: '1rem', color: 'var(--secondary)' }}>
                        Use custom buttons or the × button to close.
                      </p>
                      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <Button variant="secondary" size="small" onClick={() => {
                          closeModal();
                        }}>
                          Custom Close
                        </Button>
                        <Button variant="primary" size="small" onClick={() => {
                          alert('Custom action!');
                        }}>
                          Custom Action
                        </Button>
                      </div>
                    </div>,
                    { 
                      title: 'Modal Without Actions',
                      hideActions: true
                    }
                  )}
                >
                  Open Modal (No Actions)
                </Button>
              </div>

              <div className="showcase-item">
                <h4>Form Modal</h4>
                <p style={{ fontSize: '0.9em', color: 'var(--secondary)', marginBottom: '0.75rem' }}>
                  Modal with form inputs
                </p>
                <Button
                  variant="primary"
                  onClick={() => openModal(
                    <div style={{ padding: '1rem' }}>
                      <div className="input-group">
                        <label>Name</label>
                        <input type="text" placeholder="Enter name" />
                      </div>
                      <div className="input-group" style={{ marginTop: '1rem' }}>
                        <label>Email</label>
                        <input type="email" placeholder="Enter email" />
                      </div>
                      <div className="input-group" style={{ marginTop: '1rem' }}>
                        <label>Message</label>
                        <textarea 
                          placeholder="Enter message" 
                          style={{
                            width: '100%',
                            minHeight: '100px',
                            padding: '0.6rem 0.75rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            backgroundColor: 'var(--hiddenTabBackground)',
                            color: 'var(--text)',
                            fontFamily: 'inherit',
                            fontSize: '0.9rem',
                            resize: 'vertical'
                          }}
                        />
                      </div>
                    </div>,
                    { 
                      title: 'Form Modal',
                      onConfirm: async () => {
                        alert('Form submitted!');
                        return true;
                      }
                    }
                  )}
                >
                  Open Form Modal
                </Button>
              </div>

              <div className="showcase-item">
                <h4>Rich Content Modal</h4>
                <p style={{ fontSize: '0.9em', color: 'var(--secondary)', marginBottom: '0.75rem' }}>
                  Modal with cards, badges, and complex layout
                </p>
                <Button
                  variant="primary"
                  onClick={() => openModal(
                    <div style={{ padding: '1rem' }}>
                      <div style={{ marginBottom: '1rem' }}>
                        <Card variant="default">
                          <div style={{ padding: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              <Badge variant="success">Active</Badge>
                              <h4 style={{ margin: 0 }}>Service Status</h4>
                            </div>
                            <p style={{ margin: 0, color: 'var(--secondary)' }}>
                              All systems operational
                            </p>
                          </div>
                        </Card>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                        <Card variant="clickable">
                          <div style={{ padding: '0.75rem' }}>
                            <Badge variant="primary">Option 1</Badge>
                          </div>
                        </Card>
                        <Card variant="clickable">
                          <div style={{ padding: '0.75rem' }}>
                            <Badge variant="secondary">Option 2</Badge>
                          </div>
                        </Card>
                      </div>
                    </div>,
                    { 
                      title: 'Rich Content Modal',
                      hideActions: true
                    }
                  )}
                >
                  Open Rich Content Modal
                </Button>
              </div>

              <div className="showcase-item">
                <h4>Confirmation Modal</h4>
                <p style={{ fontSize: '0.9em', color: 'var(--secondary)', marginBottom: '0.75rem' }}>
                  Simple confirmation dialog
                </p>
                <Button
                  variant="danger"
                  onClick={() => openModal(
                    <div style={{ padding: '1rem' }}>
                      <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                        Are you sure you want to proceed?
                      </p>
                      <p style={{ color: 'var(--secondary)', fontSize: '0.9em' }}>
                        This action cannot be undone.
                      </p>
                    </div>,
                    { 
                      title: 'Confirm Action',
                      onConfirm: async () => {
                        alert('Action confirmed!');
                        return true;
                      }
                    }
                  )}
                >
                  Open Confirmation Modal
                </Button>
              </div>
            </div>

            <div className="showcase-item" style={{ marginTop: '32px' }}>
              <h4>Modal Features:</h4>
              <ul style={{ color: 'var(--secondary)', lineHeight: '1.6', fontSize: '0.9em' }}>
                <li>Single modal at a time (opening a new modal replaces the current one)</li>
                <li>Default max-width: 600px (95vw on mobile)</li>
                <li>Full-screen option: 95vw × 90vh (via CSS override)</li>
                <li>Optional title in header</li>
                <li>Optional default action buttons (Confirm/Cancel)</li>
                <li>Custom content with any React components</li>
                <li>Keyboard accessible (ESC to close, Enter to confirm)</li>
                <li>Focus management and ARIA attributes</li>
                <li>Overlay with backdrop blur</li>
                <li>Close button (×) always available in header</li>
                <li>Scrollable content area when content exceeds viewport</li>
                <li>Mobile-responsive with adjusted sizing</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
