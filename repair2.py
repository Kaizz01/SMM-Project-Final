import re

path = '/home/kaizz/project/idk/components/objectives-page.tsx'
with open(path, encoding='utf-8') as f:
    c = f.read()

count = 0
def rep(old, new):
    global c, count
    if old in c:
        c = c.replace(old, new, 1)
        count += 1
        print('OK:', repr(old[:60]))
    else:
        print('MISS:', repr(old[:60]))

H = '\u2500'

rep(
    '  // ' + H*2 + ' Helpers ' + H*60 + '\n  // Helper: node name by ID\n    if (startCities.includes(id)) return',
    "  // Helper: node name by ID\n  const getNodeName = (id: string): 'start' | 'end' | 'normal' => {\n    if (startCities.includes(id)) return"
)

rep(
    '          {/* ' + H*2 + ' Cities to Visit ' + H*35 + ' */}\n          {/* Cities to visit */}\n            <CardHeader>',
    '          {/* Cities to visit */}\n          <Card>\n            <CardHeader>'
)

rep(
    '          {/* ' + H*2 + ' Vehicles ' + H*42 + ' */}\n          {/* Vehicles */}\n            <CardHeader>',
    '          {/* Vehicles */}\n          <Card>\n            <CardHeader>'
)

rep(
    '          {/* ' + H*2 + ' Constraints ' + H*41 + ' */}\n          {/* Constraints */}\n            <CardHeader>',
    '          {/* Constraints */}\n          <Card>\n            <CardHeader>'
)

rep(
    '          {/* ' + H*2 + ' Optimization Goal ' + H*36 + ' */}\n          {/* Optimization goal */}\n            <CardHeader>',
    '          {/* Optimization goal */}\n          <Card>\n            <CardHeader>'
)

rep(
    '        {/* ' + H*2 + ' Actions ' + H*44 + ' */}\n        {/* Actions */}\n          <Button variant=',
    '        {/* Actions */}\n        <div className="flex justify-between gap-3 mt-8">\n          <Button variant='
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print(f'Done - {count} replacements')
