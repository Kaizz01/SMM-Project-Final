import re

path = '/home/kaizz/project/idk/components/objectives-page.tsx'
with open(path, encoding='utf-8-sig') as f:
    c = f.read()

H = '\u2500'  # box-drawing dash, expanded at Python runtime
cc = '[' + H + ' ]+'  # character class: one-or-more dashes or spaces

def fix(pattern, repl):
    global c
    result, n = re.subn(pattern, repl, c)
    if n:
        c = result
        print('OK:', pattern[:70])
    else:
        print('MISS:', pattern[:70])

# 1. Remove Drag-and-drop (normals only) banner line
fix('  // ' + H + H + ' Drag-and-drop [(]normals only[)]' + cc + '\n', '')

# 2. Vehicle count stepper: remove banner, add function signature
fix('  // ' + H + H + ' Vehicle: count stepper' + cc + '\n  // Vehicle count stepper\n',
    '  // Vehicle count stepper\n  function setCount(vehicleId: string, delta: number) {\n')

# 3. Submit: remove banner, add function signature
fix('  // ' + H + H + ' Submit' + cc + '\n  // Form submission: build and commit the Objective\n',
    '  // Form submission: build and commit the Objective\n  function handleSubmit() {\n')

# 4. Helpers: remove banner, add const definition
fix('  // ' + H + H + ' Helpers' + cc + '\n  // Helper: node name by ID\n    if',
    "  // Helper: node name by ID\n  const getNodeName = (id: string): 'start' | 'end' | 'normal' => {\n    if")

# 5-8. JSX Card sections: remove banner, add <Card>
for title, clean in [
    ('Cities to Visit', 'Cities to visit'),
    ('Vehicles', 'Vehicles'),
    ('Constraints', 'Constraints'),
    ('Optimization Goal', 'Optimization goal'),
]:
    fix('          [{][/][*] ' + H + H + ' ' + title + cc + '[*][}]\n          [{][/][*] ' + clean + ' [*][}]\n            <CardHeader>',
        '          {/* ' + clean + ' */}\n          <Card>\n            <CardHeader>')

# 9. Actions: remove banner, add wrapper div
fix('        [{][/][*] ' + H + H + ' Actions' + cc + '[*][}]\n        [{][/][*] Actions [*][}]\n          <Button variant=',
    '        {/* Actions */}\n        <div className="flex justify-between gap-3 mt-8">\n          <Button variant=')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
