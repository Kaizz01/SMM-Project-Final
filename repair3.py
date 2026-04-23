import re

path = '/home/kaizz/project/idk/components/objectives-page.tsx'
with open(path, encoding='utf-8-sig') as f:
    c = f.read()

H2 = '\u2500\u2500'

def fix(pattern, repl):
    global c
    result, n = re.subn(pattern, repl, c)
    if n:
        c = result
        print(f'OK: {pattern[:60]}')
    else:
        print(f'MISS: {pattern[:60]}')

# Remove old banners, keep new comment, add missing code

# 1. Drag-and-drop (normals only) - just remove the banner
fix(r'  // ' + H2 + r' Drag-and-drop \(normals only\)[\u2500 ]+\n',
    '')

# 2. Vehicle count stepper - remove banner, add function signature
fix(r'  // ' + H2 + r' Vehicle: count stepper[\u2500 ]+\n  // Vehicle count stepper\n',
    '  // Vehicle count stepper\n  function setCount(vehicleId: string, delta: number) {\n')

# 3. Submit - remove banner, add function signature
fix(r'  // ' + H2 + r' Submit[\u2500 ]+\n  // Form submission: build and commit the Objective\n',
    '  // Form submission: build and commit the Objective\n  function handleSubmit() {\n')

# 4. Helpers - remove banner, add const definition
fix(r'  // ' + H2 + r" Helpers[\u2500 ]+\n  // Helper: node name by ID\n    if",
    "  // Helper: node name by ID\n  const getNodeName = (id: string): 'start' | 'end' | 'normal' => {\n    if")

# 5. Cities to Visit JSX - remove banner, add <Card>
fix(r"          \{/\* " + H2 + r" Cities to Visit[\u2500 ]+\*/\}\n          \{/\* Cities to visit \*/\}\n            <CardHeader>",
    '          {/* Cities to visit */}\n          <Card>\n            <CardHeader>')

# 6. Vehicles JSX - remove banner, add <Card>
fix(r"          \{/\* " + H2 + r" Vehicles[\u2500 ]+\*/\}\n          \{/\* Vehicles \*/\}\n            <CardHeader>",
    '          {/* Vehicles */}\n          <Card>\n            <CardHeader>')

# 7. Constraints JSX - remove banner, add <Card>
fix(r"          \{/\* " + H2 + r" Constraints[\u2500 ]+\*/\}\n          \{/\* Constraints \*/\}\n            <CardHeader>",
    '          {/* Constraints */}\n          <Card>\n            <CardHeader>')

# 8. Optimization Goal JSX - remove banner, add <Card>
fix(r"          \{/\* " + H2 + r" Optimization Goal[\u2500 ]+\*/\}\n          \{/\* Optimization goal \*/\}\n            <CardHeader>",
    '          {/* Optimization goal */}\n          <Card>\n            <CardHeader>')

# 9. Actions JSX - remove banner, add wrapper div
fix(r"        \{/\* " + H2 + r" Actions[\u2500 ]+\*/\}\n        \{/\* Actions \*/\}\n          <Button variant=",
    '        {/* Actions */}\n        <div className="flex justify-between gap-3 mt-8">\n          <Button variant=')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
